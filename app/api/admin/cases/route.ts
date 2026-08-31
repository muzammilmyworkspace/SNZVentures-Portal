import { NextResponse } from "next/server";
import { apiRequireStaff, isAdmin } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";
import * as ops from "@/lib/db/repos/operations";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CASE STATUS — the step that closes the loop.
 *
 * A client submits, staff move it on, the client sees the change. Without this
 * the portal is a form that goes nowhere, which is the difference between a
 * product and a prototype.
 *
 * THREE THINGS HAPPEN TOGETHER, and all three matter:
 *   1. the case moves,
 *   2. the transition is written to `status_history`, so the client can see
 *      how it got here rather than only where it is,
 *   3. the client is notified, because a status nobody is told about is a
 *      status nobody acts on.
 *
 * ADVISOR SCOPING is resolved against the database, not the request: an
 * advisor may only move a case belonging to a client assigned to them.
 */

const ALLOWED = new Set([
  "new",
  "assessment",
  "in_progress",
  "documents_required",
  "under_review",
  "awaiting_client",
  "completed",
  "closed",
]);

/** Wording the client will actually read, per status. */
const CLIENT_NOTE: Record<string, string> = {
  assessment: "Your case is being assessed.",
  in_progress: "Work on your case has started.",
  documents_required: "We need a document from you before this can continue.",
  under_review: "Your case is under review.",
  awaiting_client: "We're waiting on something from you.",
  completed: "Your case is complete.",
  closed: "Your case has been closed.",
};

export async function PATCH(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!rateLimit(`case:${session.userId}`, { limit: 60, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many updates." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { caseId, status, note } = (body ?? {}) as Record<string, unknown>;

  if (typeof caseId !== "string" || !caseId) {
    return NextResponse.json({ ok: false, error: "Missing case." }, { status: 400 });
  }
  if (typeof status !== "string" || !ALLOWED.has(status)) {
    return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
  }

  const existing = await repo.getCaseById(caseId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  // An advisor may only touch their own clients' cases. Checked in the
  // database rather than inferred from what the UI offered.
  if (!isAdmin(session.role)) {
    const mine = await repo.getAssignedClients(session.userId);
    if (!mine.some((c) => c.id === existing.clientId)) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
  }

  if (existing.status === status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const cleanNote =
    typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  // The note is also the case's `next_action`: it is the same sentence the
  // client needs to read, and keeping two copies lets them drift apart.
  await repo.updateCaseStatus(caseId, status, cleanNote);

  await ops.recordStatus({
    entity: "case",
    entityId: caseId,
    subjectId: existing.clientId,
    fromStatus: existing.status,
    toStatus: status,
    note: cleanNote,
    actorId: session.userId,
  });

  await repo.notify({
    userId: existing.clientId,
    title: `${existing.title}: ${status.replace(/_/g, " ")}`,
    body: CLIENT_NOTE[status] ?? "Your case status has changed.",
    href: "/portal/cases",
    kind: "status",
  });

  await audit({
    action: "case.status_changed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "case",
    entityId: caseId,
    meta: { from: existing.status, to: status },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, status });
}

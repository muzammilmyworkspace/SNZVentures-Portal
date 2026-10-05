import { NextResponse } from "next/server";
import { apiRequireStaff, isAdmin } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { apiAreaAllowed } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Approve every document a student has uploaded that is still waiting, from
 * the documents panel. One notification for the lot rather than one per file.
 * A consultant may do this only for their own students.
 */
export async function POST(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  {
    const denied = await apiAreaAllowed(guard.session, "applications");
    if (denied) return denied;
  }

  if (!rateLimit(`docs-approve-all:${session.userId}`, { limit: 30, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down a moment." }, { status: 429 });
  }

  let userId = "";
  try {
    const body = (await request.json()) as { userId?: unknown };
    userId = typeof body.userId === "string" ? body.userId : "";
  } catch {}
  if (!userId) return NextResponse.json({ ok: false, error: "Which student?" }, { status: 400 });

  if (!isAdmin(session.role)) {
    const mine = await repo.getAssignedClients(session.userId);
    if (!mine.some((c) => c.id === userId)) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
  }

  const count = await repo.approveAllDocuments(userId, session.userId);
  if (count > 0) {
    await repo.notify({
      userId,
      kind: "document",
      title: count === 1 ? "Your document has been approved" : `${count} of your documents have been approved`,
      href: "/portal/documents",
    });
    await audit({
      action: "document.reviewed",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "user",
      entityId: userId,
      meta: { status: "approved", count, bulk: true },
      ip: clientIp(request),
    });
  }
  return NextResponse.json({ ok: true, count });
}

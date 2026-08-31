import { NextResponse } from "next/server";
import { apiRequireStaff } from "@/lib/auth/guard";
import * as ops from "@/lib/db/repos/operations";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * INTERNAL NOTES — STAFF ONLY.
 *
 * `apiRequireStaff` gates every method. There is no client-readable path to
 * this data anywhere in the application: `lib/db/repos/operations.ts` exposes
 * no client-scoped reader for admin_notes at all, so a note cannot reach a
 * client surface even by mistake.
 *
 * The note BODY is never written to the audit log. Notes routinely contain a
 * candid assessment of a person, and duplicating that into a second table that
 * is retained differently is how it ends up somewhere it should not be.
 */

const MAX = 4000;

export async function GET(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;

  const subject = new URL(request.url).searchParams.get("subject");
  if (!subject) {
    return NextResponse.json({ ok: false, error: "Missing subject." }, { status: 400 });
  }

  const notes = await ops.getAdminNotes(subject);
  return NextResponse.json({ ok: true, notes });
}

export async function POST(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!rateLimit(`note:${session.userId}`, { limit: 60, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many notes." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { subjectId, caseId, note } = (body ?? {}) as Record<string, unknown>;

  if (typeof subjectId !== "string" || !subjectId) {
    return NextResponse.json({ ok: false, error: "Missing subject." }, { status: 400 });
  }
  if (typeof note !== "string" || !note.trim()) {
    return NextResponse.json({ ok: false, error: "Write a note first." }, { status: 400 });
  }

  const created = await ops.addAdminNote({
    subjectId,
    caseId: typeof caseId === "string" && caseId ? caseId : null,
    authorId: session.userId,
    body: note.trim().slice(0, MAX),
  });

  if (!created) {
    return NextResponse.json({ ok: false, error: "Note not saved." }, { status: 503 });
  }

  await audit({
    action: "note.added",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: subjectId,
    // Length only — never the text. See the header note.
    meta: { length: note.trim().length },
    ip: clientIp(request),
  });

  return NextResponse.json({
    ok: true,
    note: { ...created, authorName: session.name },
  });
}

export async function DELETE(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

  // Scoped to the author in SQL — one staff member cannot erase another's
  // record of a conversation.
  const removed = await ops.deleteAdminNote(id, session.userId);
  if (!removed) {
    return NextResponse.json(
      { ok: false, error: "Not found, or not yours to delete." },
      { status: 404 }
    );
  }

  await audit({
    action: "note.deleted",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "admin_note",
    entityId: id,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

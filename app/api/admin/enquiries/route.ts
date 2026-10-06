import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { apiAreaAllowed } from "@/lib/auth/permissions";
import { markHandled, markUnhandled } from "@/lib/db/repos/enquiries";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mark a website enquiry answered (or undo it). Answered enquiries leave the
 * "Not yet answered" count, the sidebar badge and the dashboard card.
 */
export async function PATCH(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const denied = await apiAreaAllowed(guard.session, "enquiries");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Which enquiry?" }, { status: 400 });
  const handled = body.handled !== false;

  const ok = handled ? await markHandled(id) : await markUnhandled(id);
  if (!ok) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  await audit({
    action: "admin.action",
    actorId: guard.session.userId,
    actorEmail: guard.session.email,
    entity: "enquiry",
    entityId: id,
    meta: { enquiry: handled ? "answered" : "reopened" },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

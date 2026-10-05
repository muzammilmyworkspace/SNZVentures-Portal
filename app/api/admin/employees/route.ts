import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { setPermissions } from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import { AREA_KEYS } from "@/lib/portal/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Change what an employee may use. Super admin only, and only on admin
 * accounts (a super admin is never restricted). `full: true` lifts every
 * restriction; otherwise at least one area must stay ticked.
 */
export async function PATCH(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const full = body.full === true;
  const areas = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter((p): p is string => typeof p === "string" && (AREA_KEYS as string[]).includes(p)))]
    : [];
  if (!userId) return NextResponse.json({ ok: false, error: "Which employee?" }, { status: 400 });
  if (!full && areas.length === 0) {
    return NextResponse.json({ ok: false, error: "Tick at least one area, or give full access." }, { status: 400 });
  }

  const ok = await setPermissions(userId, full ? null : areas);
  if (!ok) return NextResponse.json({ ok: false, error: "Only an employee's access can be changed." }, { status: 404 });

  await audit({
    action: "staff.details_updated",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: userId,
    meta: { permissions: full ? "full" : areas },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

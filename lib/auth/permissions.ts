import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";
import { requireAdmin, apiRequireUser } from "@/lib/auth/guard";
import { canUse, type Area } from "@/lib/portal/permissions";
import type { Session } from "@/lib/auth/types";

/**
 * Employee access, enforced on the server. Read from the database on each
 * check rather than carried in the session, so taking an area away works on
 * the next click instead of at the next sign-in.
 */
export async function permissionsOf(userId: string): Promise<string[] | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`SELECT permissions FROM users WHERE id = ${userId}`;
    return (r?.permissions as string[] | null) ?? null;
  }, null);
}

/** Page guard: an admin who may use this area, or back to the dashboard. */
export async function requireArea(area: Area) {
  const guard = await requireAdmin();
  if (!canUse(guard.session.role, await permissionsOf(guard.session.userId), area)) redirect("/portal/admin");
  return guard;
}

/**
 * API check for a signed-in session: false (with a 403 to return) when an
 * admin is restricted away from this area. Consultants and clients are not
 * affected; their own rules live in each route.
 */
export async function apiAreaAllowed(session: Session, area: Area): Promise<NextResponse | null> {
  if (session.role !== "admin") return null;
  if (canUse(session.role, await permissionsOf(session.userId), area)) return null;
  return NextResponse.json({ ok: false, error: "You do not have access to this area." }, { status: 403 });
}

export { apiRequireUser };

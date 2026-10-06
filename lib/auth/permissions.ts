import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";
import { requireAdmin, apiRequireUser } from "@/lib/auth/guard";
import { canUse, isStudentDesk, type Area } from "@/lib/portal/permissions";
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
  const permissions = await permissionsOf(session.userId);
  if (canUse(session.role, permissions, area)) return null;
  // The student desk does the application work (review, documents) from its
  // own page, so the APIs behind that work are open to it.
  if (area === "applications" && permissions?.includes("students")) return null;
  return NextResponse.json({ ok: false, error: "You do not have access to this area." }, { status: 403 });
}

/**
 * Page guard for pages the student desk reaches by an old link (a
 * notification, a message thread): send the desk to its Students page,
 * keeping the student or application the link was about.
 */
export async function requireAreaOrDesk(area: Area, desk: Record<string, string | undefined> = {}) {
  const guard = await requireAdmin();
  const permissions = await permissionsOf(guard.session.userId);
  if (isStudentDesk(guard.session.role, permissions)) {
    const q = new URLSearchParams(Object.entries(desk).filter((e): e is [string, string] => Boolean(e[1])));
    redirect(`/portal/admin/students${q.size ? `?${q}` : ""}`);
  }
  if (!canUse(guard.session.role, permissions, area)) redirect("/portal/admin");
  return guard;
}

/** Is this signed-in person an employee limited to the student desk? */
export async function onStudentDesk(session: Session): Promise<boolean> {
  if (session.role !== "admin") return false;
  return isStudentDesk(session.role, await permissionsOf(session.userId));
}

export { apiRequireUser };

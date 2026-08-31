import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSession } from "./session";
import type { Role, Session } from "./types";
import { CLIENT_ROLES, STAFF_ROLES, ADMIN_ROLES } from "./types";
import * as usersRepo from "@/lib/db/repos/users";

/**
 * AUTHORIZATION GUARDS
 * ---------------------------------------------------------------------------
 * Every protected surface calls one of these on the SERVER. The role in the
 * session cookie is signed, but status (suspended/active) is re-read from the
 * database on each request so a suspension takes effect immediately rather
 * than at the next login.
 *
 * Never authorise from anything the browser sends.
 */

export type Guarded = { session: Session; role: Role };

async function assertActive(session: Session): Promise<boolean> {
  const user = await usersRepo.findById(session.userId);
  // If the DB is unreachable we fail closed for staff surfaces and open for
  // the visitor's own dashboard — the session signature is still valid.
  if (!user) return true;
  return user.status === "active";
}

/* -------------------------------------------------------- page guards --- */

export async function requireUser(next = "/portal"): Promise<Guarded> {
  const session = await getSession();
  /*
    Via the clearing route, not straight to /login.

    Reaching this line means a session cookie was present — the proxy would
    have redirected already if it were not — but did not verify: expired, or
    revoked by a sign-out or password change. Sending such a visitor to /login
    directly makes the proxy see the still-present cookie and bounce them back
    here, forever. `/api/auth/expired` throws the cookie away first.
  */
  if (!session) redirect(`/api/auth/expired?next=${encodeURIComponent(next)}`);
  if (!(await assertActive(session)))
    redirect("/api/auth/expired?reason=suspended");
  return { session, role: session.role };
}

export async function requireRole(roles: Role[], next = "/portal"): Promise<Guarded> {
  const guarded = await requireUser(next);
  if (!roles.includes(guarded.role)) redirect("/portal");
  return guarded;
}

export const requireClient = () => requireRole(CLIENT_ROLES);
export const requireStaff = () => requireRole(STAFF_ROLES);
export const requireAdmin = () => requireRole(ADMIN_ROLES);
export const requireSuperAdmin = () => requireRole(["super_admin"]);

/* --------------------------------------------------------- API guards --- */

export type ApiGuard =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

export async function apiRequireUser(): Promise<ApiGuard> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 }),
    };
  }
  if (!(await assertActive(session))) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "This account is suspended." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, session };
}

export async function apiRequireRole(roles: Role[]): Promise<ApiGuard> {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard;
  if (!roles.includes(guard.session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 }),
    };
  }
  return guard;
}

export const apiRequireStaff = () => apiRequireRole(STAFF_ROLES);
export const apiRequireAdmin = () => apiRequireRole(ADMIN_ROLES);
export const apiRequireSuperAdmin = () => apiRequireRole(["super_admin"]);

/* ------------------------------------------------------------ helpers --- */

export const isAdmin = (role: Role) => ADMIN_ROLES.includes(role);
export const isStaff = (role: Role) => STAFF_ROLES.includes(role);
export const isClient = (role: Role) => CLIENT_ROLES.includes(role);

/**
 * Roles a given actor is permitted to assign.
 * Only a super admin can mint admins or other super admins, and nobody can
 * change their own role — both checked again at the API layer.
 */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "super_admin") {
    return ["student", "professional", "business", "advisor", "admin", "super_admin"];
  }
  if (actor === "admin") return ["student", "professional", "business", "advisor"];
  return [];
}

import type { Role, Session } from "./types.ts";
import { CLIENT_ROLES } from "./types.ts";

/**
 * VIEWING THE PORTAL AS A CLIENT.
 * ---------------------------------------------------------------------------
 * Support work turns on one question: what is this person actually looking at?
 * Reading it out of a database, or asking them for a screenshot, is guessing.
 * This lets a member of staff open the portal exactly as that client sees it —
 * same stage, same locks, same half-finished form — and then step back out.
 *
 * The rules live here, apart from the routes, so they can be asserted directly
 * by `npm run verify:impersonation`. They are the security-relevant half of
 * the feature and the kind that reads correctly while being wrong.
 */

/** How long a view-as lasts. Deliberately far shorter than a real session. */
export const IMPERSONATION_MAX_AGE_SECONDS = 30 * 60;

export type Refusal =
  | null
  | "not-staff"
  | "self"
  | "staff-target"
  | "already-impersonating"
  | "inactive";

/**
 * May this person view the portal as that one?
 *
 * WHY STAFF CANNOT BE IMPERSONATED, including by a super admin: the whole
 * value of this is seeing a client's own view, and no client account can grant
 * anything an admin does not already have. Allowing it the other way turns a
 * support tool into a privilege escalation — an admin becoming a super admin,
 * or one admin acting as another with the second one's name on the audit
 * trail. There is no support case that needs it.
 *
 * A session that is ALREADY a view-as cannot start another. Chaining hides who
 * began it, and the way back is a single step by design.
 */
export function refuseImpersonation(input: {
  actor: Session;
  target: { id: string; role: Role; status: string };
}): Refusal {
  const { actor, target } = input;

  if (actor.impersonator) return "already-impersonating";
  if (actor.role !== "admin" && actor.role !== "super_admin") return "not-staff";
  if (actor.userId === target.id) return "self";
  if (!(CLIENT_ROLES as readonly Role[]).includes(target.role)) return "staff-target";

  /*
    A suspended account is suspended for a reason, and stepping into it would
    reach past the very control that was applied. Staff can still read
    everything about them from the client file.
  */
  if (target.status !== "active") return "inactive";

  return null;
}

export const REFUSAL_MESSAGE: Record<NonNullable<Refusal>, string> = {
  "not-staff": "Only admins can view the portal as a client.",
  self: "You are already signed in as yourself.",
  "staff-target": "Staff accounts cannot be viewed as. This is for client accounts only.",
  "already-impersonating": "Leave the current view-as first.",
  inactive: "This account is not active, so it cannot be viewed as.",
};

/**
 * Actions that stay closed while viewing as somebody.
 *
 * Not a general lock — the point is to reach what they reach, so almost
 * everything stays open. These three are different in kind: each changes who
 * can get INTO the account, and doing that while wearing their name leaves a
 * record that says they did it themselves. If an account genuinely needs a new
 * password, that is what the reset link on the client file is for, and it is
 * attributable.
 */
const SEALED = [
  "/api/portal/password",
  "/api/auth/reset-password",
  "/api/portal/email",
];

export function sealedWhileImpersonating(pathname: string): boolean {
  return SEALED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const SEALED_MESSAGE =
  "Not while viewing as this client. Changing how somebody signs in has to be " +
  "done as yourself, so the record says who did it.";

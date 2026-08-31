import { NextResponse } from "next/server";
import { apiRequireAdmin, assignableRoles } from "@/lib/auth/guard";
import * as usersRepo from "@/lib/db/repos/users";
import * as portalRepo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import type { Role } from "@/lib/auth/types";
import * as store from "@/lib/auth/store";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * ADMIN USER OPERATIONS
 * ---------------------------------------------------------------------------
 * Privilege-escalation defences, all enforced here on the server:
 *
 *  1. Caller must already be admin or super_admin.
 *  2. `assignableRoles()` caps what the caller may grant — only a super_admin
 *     can mint admin or super_admin.
 *  3. Nobody may change their OWN role or status, so an admin cannot promote
 *     themselves and cannot lock themselves out.
 *  4. Only a super_admin may modify another super_admin.
 *  5. Every change is written to the audit log with the actor recorded.
 */
export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const ip = clientIp(request);
  if (!rateLimit(`admin:${session.userId}`, { limit: 60, windowMs: 5 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { action, userId, role, status, advisorId } = (body ?? {}) as Record<string, unknown>;

  if (typeof action !== "string" || typeof userId !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // (3) Never operate on yourself through the admin surface.
  if (userId === session.userId) {
    return NextResponse.json(
      { ok: false, error: "You cannot change your own role or status." },
      { status: 403 }
    );
  }

  const target = await usersRepo.findById(userId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  // (4) Only a super admin may act on another super admin.
  if (target.role === "super_admin" && session.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  switch (action) {
    case "set_role": {
      if (typeof role !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
      }
      // (2) Cap on what this actor may grant.
      if (!assignableRoles(session.role).includes(role as Role)) {
        return NextResponse.json(
          { ok: false, error: "You cannot assign that role." },
          { status: 403 }
        );
      }
      await usersRepo.setRole(userId, role as Role);
      await audit({
        action: "user.role_changed",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: userId,
        meta: { from: target.role, to: role },
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    case "suspend":
    case "activate": {
      const next = action === "suspend" ? "suspended" : "active";
      await usersRepo.setStatus(userId, next);
      await audit({
        action: action === "suspend" ? "user.suspended" : "user.activated",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: userId,
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    case "assign_advisor": {
      if (typeof advisorId !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid advisor." }, { status: 400 });
      }
      const advisor = await usersRepo.findById(advisorId);
      if (!advisor || !["advisor", "admin", "super_admin"].includes(advisor.role)) {
        return NextResponse.json(
          { ok: false, error: "That user is not an advisor." },
          { status: 400 }
        );
      }
      await portalRepo.assignAdvisor(userId, advisorId, session.userId);
      await audit({
        action: "staff.assigned",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: userId,
        meta: { advisorId },
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    case "unassign_advisor": {
      if (typeof advisorId !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid advisor." }, { status: 400 });
      }
      await portalRepo.unassignAdvisor(userId, advisorId);
      await audit({
        action: "staff.unassigned",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: userId,
        meta: { advisorId },
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    /*
      A RESET LINK, NOT A PASSWORD.

      Passwords are scrypt hashes and cannot be read back — by design, and
      nothing here weakens that. What an administrator actually needs when
      somebody is locked out is a way back IN, so this mints the same
      single-use, 30-minute token the "forgot password" flow uses and hands
      the link to the operator to pass on.

      That also makes this the answer when no mail transport is configured:
      the link works whether or not email is going out, which is exactly the
      situation this feature was built in the middle of.

      Issuing one INVALIDATES any outstanding reset for that account, so an
      old link a support agent sent yesterday stops working the moment a new
      one is made.
    */
    case "reset_password": {
      const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(
        await store.issueToken(userId, "password_reset", 30)
      )}`;
      await audit({
        action: "user.password_reset_link",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: userId,
        meta: { for: target.email },
        ip,
      });
      return NextResponse.json({ ok: true, link, expiresInMinutes: 30 });
    }

    /*
      DELETION IS SUPER-ADMIN ONLY, and it is not reversible.

      Every table that references a user cascades, so this takes their cases,
      documents, messages, notifications, consents and fee submissions with it.
      For a client who has sent us passport scans that is usually what erasure
      is supposed to mean — but it is also why an ordinary admin cannot do it
      from a dropdown next to "suspend".

      Suspension is the reversible one and is what most situations want; this
      exists for a genuine erasure request. The stored OBJECTS are not removed
      here: the rows pointing at them go, so nothing in the app can reach them,
      but the files stay in the bucket until they are cleared separately. Saying
      so plainly beats implying a completeness this cannot deliver.
    */
    case "delete": {
      if (session.role !== "super_admin") {
        return NextResponse.json(
          { ok: false, error: "Only a super administrator can delete an account." },
          { status: 403 }
        );
      }
      await usersRepo.deleteUser(userId);
      await audit({
        action: "user.deleted",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: userId,
        meta: { email: target.email, role: target.role },
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
}

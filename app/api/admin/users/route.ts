import { NextResponse } from "next/server";
import { apiRequireAdmin, assignableRoles } from "@/lib/auth/guard";
import * as usersRepo from "@/lib/db/repos/users";
import * as portalRepo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import type { Role } from "@/lib/auth/types";

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

    default:
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
}

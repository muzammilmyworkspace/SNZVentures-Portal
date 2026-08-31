import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NOTIFICATIONS
 * ---------------------------------------------------------------------------
 * Always the caller's own. There is no user id in the request and no admin
 * override — a notification is addressed to one person, and no surface in this
 * product needs to read someone else's.
 */

export async function GET() {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;

  const items = await repo.getNotifications(guard.session.userId, 50);
  return NextResponse.json({
    ok: true,
    items,
    unread: items.filter((n) => !n.read).length,
  });
}

/** Mark every unread notification read. */
export async function PATCH() {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;

  await repo.markNotificationsRead(guard.session.userId);
  return NextResponse.json({ ok: true });
}

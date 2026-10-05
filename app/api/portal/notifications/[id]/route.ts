import { NextResponse } from "next/server";
import { apiRequireUser, isStaff } from "@/lib/auth/guard";
import { openNotification } from "@/lib/db/repos/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OPEN A NOTIFICATION: mark it read, then go where it points.
 *
 * Used by the bell and the Notifications page, so a click always takes you
 * to the thing and clears it. A notification with no link goes to the place
 * its kind belongs to. Only links inside the portal are followed.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const { id } = await params;
  const base = new URL(request.url);

  const found = /^[0-9a-f-]{36}$/i.test(id) ? await openNotification(session.userId, id) : null;
  const staff = isStaff(session.role);
  const fallback: Record<string, string> = {
    message: "/portal/messages",
    appointment: "/portal/appointments",
    document: staff ? "/portal/admin/requests" : "/portal/documents",
    status: staff ? "/portal/admin" : "/portal/journey",
  };
  const target =
    found?.href && found.href.startsWith("/") && !found.href.startsWith("//")
      ? found.href
      : found
        ? fallback[found.kind] ?? "/portal/notifications"
        : "/portal/notifications";
  return NextResponse.redirect(new URL(target, base.origin), 303);
}

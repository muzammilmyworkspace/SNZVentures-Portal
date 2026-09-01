import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { createState } from "@/lib/auth/oauth";
import { driveAuthUrl, driveConfigured } from "@/lib/integrations/drive";
import { disconnect } from "@/lib/db/repos/drive";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * START THE DRIVE CONNECTION, or end it.
 *
 * Admins only, and deliberately separate from "sign in with Google": mixing
 * the two would ask every student signing in to hand over access to a Drive,
 * which is both alarming and wrong.
 *
 * The `state` is the same signed, expiring value the sign-in flow uses, so the
 * CSRF protection here is the one that has already been thought through rather
 * than a second, weaker one written for this.
 */
export async function GET(request: Request) {
  await requireAdmin();

  /*
    Every redirect here is resolved against the REQUEST, not a configured base.
    NEXT_PUBLIC_PORTAL_URL was empty on this deployment and `new URL(path, "")`
    throws — so a connection that had already succeeded ended in a 500 on the
    way back. The origin the browser reached us on cannot be misconfigured.
  */
  const origin = new URL(request.url).origin;

  if (!driveConfigured()) {
    return NextResponse.redirect(
      new URL("/portal/admin/integrations?drive=unconfigured", origin)
    );
  }

  return NextResponse.redirect(
    driveAuthUrl(createState("/portal/admin/integrations"), origin)
  );
}

export async function DELETE(request: Request) {
  const { session } = await requireAdmin();
  await disconnect();
  await audit({
    action: "drive.disconnected",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "integration",
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

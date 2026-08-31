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
export async function GET() {
  await requireAdmin();

  if (!driveConfigured()) {
    return NextResponse.redirect(
      new URL("/portal/admin/integrations?drive=unconfigured", process.env.NEXT_PUBLIC_PORTAL_URL)
    );
  }

  return NextResponse.redirect(driveAuthUrl(createState("/portal/admin/integrations")));
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

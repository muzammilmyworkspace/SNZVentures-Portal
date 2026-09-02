import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import * as oauth from "@/lib/db/repos/oauth";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WITHDRAWING A CONNECTION MADE THROUGH OAUTH.
 *
 * Scoped to whoever is signed in, inside the query rather than checked before
 * it, so no combination of parameters can reach another person's grant.
 *
 * Every token that client holds for this person goes at once — access and
 * refresh, however many rotations deep. Revoking only the refresh would leave
 * the current access token working for up to an hour, and somebody who has
 * just pressed "withdraw" is usually doing it because they want it to stop
 * NOW.
 */
export async function DELETE(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Which connection?" }, { status: 400 });
  }

  const revoked = await oauth.revokeGrant(session.userId, clientId);
  if (!revoked) {
    return NextResponse.json({ ok: false, error: "No such connection." }, { status: 404 });
  }

  await audit({
    action: "oauth.grant_revoked",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "oauth_client",
    entityId: clientId,
    meta: { tokens: revoked },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, revoked });
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import * as oauth from "@/lib/db/repos/oauth";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import { redirectUriAllowed, SCOPE_READ } from "@/lib/oauth/server";
import { originFrom } from "@/lib/oauth/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WHAT PRESSING ALLOW ACTUALLY DOES.
 * ---------------------------------------------------------------------------
 * Everything the consent screen already checked is checked AGAIN here, against
 * the database rather than the form. The form fields arrived from a browser
 * and are therefore a suggestion: a page that validates and then trusts its own
 * hidden inputs on the way back has validated nothing.
 */

const deny = (redirectUri: string, state: string | null, reason: string) => {
  const url = new URL(redirectUri);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("error_description", reason);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url, { status: 303 });
};

export async function POST(request: Request) {
  /*
    CROSS-SITE POSTS ARE REFUSED BEFORE ANYTHING ELSE.

    Without this, another site could submit this form in an admin's logged-in
    browser and have an authorization code delivered to a client the attacker
    registered — consent granted by somebody who never saw a consent screen.
    Comparing Origin to our own is the standard defence and needs no token.
  */
  const origin = request.headers.get("origin");
  const self = originFrom(request);
  if (!origin || origin !== self) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  const { session, role } = await requireUser("/portal");

  const form = await request.formData();
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const clientId = field("client_id");
  const redirectUri = field("redirect_uri");
  const challenge = field("code_challenge");
  const state = field("state");
  const resource = field("resource");
  const scope = field("scope") ?? SCOPE_READ;
  const decision = field("decision");

  if (!clientId || !redirectUri || !challenge) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Re-fetched, so a tampered client_id cannot smuggle in an unregistered
  // return address by way of a hidden field.
  const client = await oauth.getClient(clientId);
  if (!client || !redirectUriAllowed(redirectUri, client.redirectUris)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Re-checked here, not only on the page: the role could have changed between
  // the screen rendering and the button being pressed.
  if (role !== "admin" && role !== "super_admin") {
    return deny(redirectUri, state, "This account cannot grant access.");
  }

  if (decision !== "allow") {
    await audit({
      action: "oauth.consent_denied",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "oauth_client",
      entityId: clientId,
      ip: clientIp(request),
    });
    return deny(redirectUri, state, "The request was cancelled.");
  }

  /*
    A VIEW-AS SESSION MUST NOT BE ABLE TO GRANT THIS.

    While impersonating, every field on the session belongs to the person being
    viewed — that is the point of it. Letting that session mint a token would
    hand out long-lived access in somebody else's name, granted by somebody who
    is not them, and the audit trail would say they did it themselves.
  */
  const live = await getSession();
  if (live?.impersonator) {
    return deny(redirectUri, state, "You cannot connect an application while viewing as somebody else.");
  }

  const code = await oauth.createCode({
    clientId,
    userId: session.userId,
    redirectUri,
    codeChallenge: challenge,
    resource: resource ?? `${self}/api/mcp`,
    scope,
  });

  await audit({
    action: "oauth.consent_granted",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "oauth_client",
    entityId: clientId,
    meta: { scope, redirectHost: new URL(redirectUri).host },
    ip: clientIp(request),
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  // 303, so the browser follows with GET rather than repeating the POST.
  return NextResponse.redirect(url, { status: 303 });
}

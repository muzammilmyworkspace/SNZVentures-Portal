import { NextResponse } from "next/server";
import * as oauth from "@/lib/db/repos/oauth";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import {
  oauthError,
  redirectUriAllowed,
  resourceMatches,
  verifyPkce,
  SCOPE_OFFLINE,
  type OAuthError,
} from "@/lib/oauth/server";
import { originFrom } from "@/lib/oauth/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE TOKEN ENDPOINT.
 * ---------------------------------------------------------------------------
 * Where an authorization code, or a refresh token, becomes access to every
 * client file in the portal. Four things are checked and none is optional:
 *
 *   1. The code exists, has not expired, and HAS NOT BEEN USED. Enforced by
 *      the database (UPDATE … WHERE used_at IS NULL RETURNING), so two
 *      simultaneous redemptions produce one winner rather than two tokens.
 *   2. PKCE. The verifier must hash to the challenge recorded when the person
 *      approved. This is what proves the request comes from whoever started
 *      the flow, and it is the ONLY such proof for a public client.
 *   3. The redirect URI matches the one the code was issued for.
 *   4. The resource matches, so the token cannot be used at another server.
 *
 * FORM-URLENCODED, NOT JSON (RFC 6749 §4.1.3). Claude sends both the exchange
 * and every refresh this way; a JSON-only parser returns 415 and the connector
 * fails after the person has already approved it.
 */

const fail = (error: OAuthError, description: string, status = 400) =>
  NextResponse.json(oauthError(error, description), {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache" },
  });

const issued = (t: {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
}) =>
  NextResponse.json(
    {
      access_token: t.accessToken,
      token_type: "Bearer",
      expires_in: t.expiresIn,
      scope: t.scope,
      ...(t.refreshToken ? { refresh_token: t.refreshToken } : {}),
    },
    { headers: { "cache-control": "no-store", pragma: "no-cache" } }
  );

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`oauth-token:${ip}`, { limit: 120, windowMs: 60_000 }).ok) {
    return fail("invalid_request", "Too many token requests.", 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("invalid_request", "Expected application/x-www-form-urlencoded.");
  }
  const field = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const grantType = field("grant_type");
  const clientId = field("client_id");
  if (!clientId) return fail("invalid_client", "client_id is required.", 401);

  const client = await oauth.getClient(clientId);
  if (!client) return fail("invalid_client", "Unknown client.", 401);

  /*
    A client that registered WITH a secret must present it. One that registered
    without is public and proves itself with PKCE instead — accepting a secret
    from it, or demanding one, would both be wrong.
  */
  if (client.hasSecret) {
    const presented = field("client_secret");
    if (!presented || !(await oauth.clientSecretMatches(clientId, presented))) {
      return fail("invalid_client", "Client authentication failed.", 401);
    }
  }

  if (grantType === "authorization_code") {
    const code = field("code");
    const verifier = field("code_verifier");
    const redirectUri = field("redirect_uri");

    if (!code) return fail("invalid_request", "code is required.");
    if (!verifier) return fail("invalid_request", "code_verifier is required.");
    if (!redirectUri) return fail("invalid_request", "redirect_uri is required.");

    /*
      CONSUMED FIRST, BEFORE ANYTHING ELSE IS CHECKED.

      A code that fails PKCE has still been presented, and leaving it live
      would let an attacker who intercepted it keep guessing verifiers. One
      redemption attempt is all any code gets, successful or not.
    */
    const record = await oauth.consumeCode(code);
    if (!record) return fail("invalid_grant", "That code is unknown, used or expired.");

    if (record.clientId !== clientId) {
      return fail("invalid_grant", "That code was issued to a different client.");
    }
    if (record.redirectUri !== redirectUri) {
      return fail("invalid_grant", "redirect_uri does not match the one the code was issued for.");
    }
    if (!redirectUriAllowed(redirectUri, client.redirectUris)) {
      return fail("invalid_grant", "That redirect URI is not registered.");
    }
    if (!verifyPkce(verifier, record.codeChallenge)) {
      return fail("invalid_grant", "The code verifier does not match the challenge.");
    }

    // Audience binding (RFC 8707): a token minted here must not be usable
    // against some other MCP server that happens to trust this issuer.
    const asked = field("resource");
    const canonical = `${originFrom(request)}/api/mcp`;
    if (asked && !resourceMatches(asked, canonical)) {
      return fail("invalid_request", "That resource is not served here.");
    }

    const tokens = await oauth.issueTokens({
      clientId,
      userId: record.userId,
      resource: record.resource ?? canonical,
      scope: record.scope,
      withRefresh: record.scope.split(/\s+/).includes(SCOPE_OFFLINE),
    });

    await audit({
      action: "oauth.token_issued",
      actorId: record.userId,
      entity: "oauth_client",
      entityId: clientId,
      meta: { grant: "authorization_code", scope: record.scope },
      ip,
    });

    return issued(tokens);
  }

  if (grantType === "refresh_token") {
    const presented = field("refresh_token");
    if (!presented) return fail("invalid_request", "refresh_token is required.");

    const found = await oauth.findRefresh(presented);

    if (found.kind === "reused") {
      /*
        THE ONE CASE WORTH BEING HARSH ABOUT.

        Every refresh is replaced on use and the old one revoked, so a revoked
        one being presented means two parties hold it — and the legitimate
        client always has the newest. That is theft, not a retry. The whole
        chain goes, which ends the attacker's access and the victim's at once.
        Losing a connection is the correct price; letting both continue quietly
        is not.
      */
      const killed = await oauth.revokeChain(found.id);
      await audit({
        action: "oauth.refresh_reused",
        entity: "oauth_client",
        entityId: clientId,
        meta: { revoked: killed },
        ip,
      });
      return fail("invalid_grant", "That refresh token has already been used.");
    }

    if (found.kind === "invalid") {
      // `invalid_grant` specifically: Claude treats it as "start again" and
      // reconnects. Any other code and the connector stays broken.
      return fail("invalid_grant", "That refresh token is not valid.");
    }

    if (found.row.clientId !== clientId) {
      return fail("invalid_grant", "That refresh token belongs to a different client.");
    }

    const tokens = await oauth.issueTokens({
      clientId,
      userId: found.row.userId,
      resource: found.row.resource,
      scope: found.row.scope,
      withRefresh: true,
      parentId: found.row.id,
    });

    // Revoked only after the replacement exists, so a failure half way through
    // leaves the old one working rather than leaving nobody with anything.
    await oauth.revokeToken(found.row.id);

    return issued(tokens);
  }

  return fail("unsupported_grant_type", `Grant type "${grantType ?? ""}" is not supported.`);
}

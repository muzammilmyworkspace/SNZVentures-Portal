import { NextResponse } from "next/server";
import * as oauth from "@/lib/db/repos/oauth";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DYNAMIC CLIENT REGISTRATION — RFC 7591.
 *
 * This is what makes connecting from claude.ai need no setup: Claude registers
 * itself here on first connection instead of somebody creating a client by
 * hand and copying credentials about.
 *
 * OPEN, AND THAT IS NOT THE HOLE IT LOOKS LIKE. Registering grants nothing. It
 * records that a client id maps to some redirect URIs; a token still requires
 * a person to sign in to this portal as an admin and press Approve, and the
 * authorization code still only travels to a URI registered here. The rate
 * limit below is about junk rows, not about access.
 *
 * NOTE THE CONTENT TYPE. RFC 7591 registration is JSON, while the token
 * endpoint is form-urlencoded (RFC 6749). They are different parsers, and
 * assuming otherwise is a documented way to return 415 to half the flow.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`oauth-register:${ip}`, { limit: 20, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Too many registrations." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body was not valid JSON." },
      { status: 400 }
    );
  }

  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];

  if (!uris.length) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris is required." },
      { status: 400 }
    );
  }

  /*
    Checked HERE as well as at the authorize step, so a URI that could never
    be honoured is refused at the point somebody can still do something about
    it. https everywhere except the loopback interface, which native clients
    legitimately use.
  */
  for (const uri of uris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return NextResponse.json(
        { error: "invalid_redirect_uri", error_description: `Not a URL: ${uri}` },
        { status: 400 }
      );
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopback) {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: `Must be https, or loopback for a native client: ${uri}`,
        },
        { status: 400 }
      );
    }
  }

  if (uris.length > 10) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "Too many redirect URIs." },
      { status: 400 }
    );
  }

  const name =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim()
      : "Claude";

  /*
    Public unless the client asks otherwise. Claude runs in a browser or on
    somebody's laptop and has nowhere to keep a secret, so it registers as a
    public client — which is precisely why PKCE is mandatory at the token
    endpoint rather than optional.
  */
  const wantsSecret = body.token_endpoint_auth_method === "client_secret_post";

  const { client, secret } = await oauth.registerClient({
    name,
    redirectUris: uris,
    wantsSecret,
  });

  await audit({
    action: "oauth.client_registered",
    entity: "oauth_client",
    entityId: client.id,
    // The id and the URIs it may be sent to; never the secret.
    meta: { name: client.name, redirectUris: uris.join(" ").slice(0, 300) },
    ip,
  });

  return NextResponse.json(
    {
      client_id: client.id,
      ...(secret ? { client_secret: secret } : {}),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: wantsSecret ? "client_secret_post" : "none",
      // 0 means it does not expire, per RFC 7591.
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(secret ? { client_secret_expires_at: 0 } : {}),
    },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
}

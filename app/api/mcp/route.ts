import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { readBearer, sameSecret, originAllowed } from "@/lib/mcp/auth";
import * as mcpTokens from "@/lib/db/repos/mcp-tokens";
import * as oauth from "@/lib/db/repos/oauth";
import { resourceMatches } from "@/lib/oauth/server";
import { originFrom } from "@/lib/oauth/origin";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { dispatch, ERR, fail, SUPPORTED_PROTOCOLS } from "@/lib/mcp/protocol";
import { TOOLS } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE MCP ENDPOINT — the portal, answering questions from Claude.
 * ---------------------------------------------------------------------------
 * Everything the admin area shows, reachable by asking for it instead of
 * clicking to it. "Which students still owe us a passport scan" is one
 * question here and eleven page loads otherwise.
 *
 * AUTHENTICATION IS A BEARER TOKEN, AND THE ENDPOINT IS OFF UNTIL IT EXISTS.
 * A missing MCP_TOKEN returns 503, not "allow" — a route that opens itself
 * when a variable is absent is one bad deploy away from being public, and
 * every other secret in this app has been through that mistake already.
 *
 * There is no cookie path on purpose. Session cookies are for browsers; this
 * is called by a program, and accepting a session here would mean any page a
 * signed-in user visits could be made to call it.
 */

const SERVER = { name: "snz-portal", version: "1.0.0" };

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

/** Whoever is asking, once their credential has been recognised. */
type Caller = {
  /** Null only for the shared environment token, which belongs to nobody. */
  userId: string | null;
  actorEmail: string;
  /** A personal key (015). */
  tokenId: string | null;
  /** An OAuth access token (016), for its own last-used stamp. */
  oauthTokenId: string | null;
};

/**
 * THREE WAYS TO ARRIVE, AND ALL OF THEM NAME A PERSON EXCEPT THE OLDEST.
 *
 * A PERSONAL KEY (`snzmcp_…`) is what Claude Code sends in a header. Looked up
 * by hash — one indexed probe — and resolved to its holder.
 *
 * AN OAUTH ACCESS TOKEN is what the hosted Claude surfaces carry: claude.ai in
 * a browser, the desktop app, the phone. They connect from Anthropic's servers
 * and cannot hold a static header, so they obtain a token through consent
 * instead. Its audience is checked against this server, so a token minted here
 * for somebody else's MCP endpoint cannot be spent at this one.
 *
 * THE SHARED MCP_TOKEN still works, because a deployment set up that way
 * should not break underneath somebody. It is checked last, compared in
 * constant time, and recorded as belonging to nobody — which is precisely its
 * weakness and why Integrations asks for it to be removed.
 */
async function identify(request: Request): Promise<Caller | null> {
  const presented = readBearer(request.headers.get("authorization"));
  if (!presented) return null;

  const person = await mcpTokens.verify(presented);
  if (person) {
    return {
      userId: person.userId,
      actorEmail: person.email,
      tokenId: person.tokenId,
      oauthTokenId: null,
    };
  }

  const granted = await oauth.verifyAccessToken(presented);
  if (granted) {
    /*
      AUDIENCE BINDING (RFC 8707). A token records the resource it was granted
      for; if that is not this server, it is refused. Without this check an
      access token issued by this portal would be accepted by any MCP server
      trusting the same issuer — the confused-deputy problem the specification
      spends a section on.
    */
    if (!resourceMatches(granted.resource, `${originFrom(request)}/api/mcp`)) return null;
    return {
      userId: granted.userId,
      actorEmail: granted.email,
      tokenId: null,
      oauthTokenId: granted.tokenId,
    };
  }

  const shared = env("MCP_TOKEN");
  if (shared && sameSecret(presented, shared)) {
    return {
      userId: null,
      actorEmail: "mcp (shared token)",
      tokenId: null,
      oauthTokenId: null,
    };
  }

  return null;
}

/**
 * The 401 that starts an OAuth connection.
 *
 * `WWW-Authenticate` carrying `resource_metadata` is how a client that has no
 * token learns where to get one. Claude only honours it on a 401 — never on a
 * 200 — and without it the connector has nothing to go on and fails with
 * "couldn't reach the server", pointing at nothing.
 */
function unauthorized(request: Request) {
  const metadata = `${originFrom(request)}/.well-known/oauth-protected-resource`;
  return NextResponse.json(
    // No detail about which half was wrong. A 401 that distinguishes "no key"
    // from "wrong key" is a probe telling an attacker they are close.
    { error: "Unauthorized." },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": `Bearer resource_metadata="${metadata}", scope="portal:read"`,
      },
    }
  );
}

export async function POST(request: Request) {
  if (!originAllowed(request.headers.get("origin"), request.url)) {
    return json({ error: "Origin not allowed." }, 403);
  }

  const caller = await identify(request);
  if (!caller) return unauthorized(request);

  const ip = clientIp(request);
  if (!rateLimit(`mcp:${ip}`, { limit: 240, windowMs: 60_000 }).ok) {
    return json({ error: "Too many requests." }, 429);
  }

  /*
    The client must send the version it agreed during initialize. The spec
    says to assume 2025-03-26 when the header is absent — which is what the
    first request, the initialize itself, looks like.
  */
  const version = request.headers.get("mcp-protocol-version");
  if (version && !SUPPORTED_PROTOCOLS.has(version)) {
    return json(
      { error: `Unsupported MCP-Protocol-Version "${version}".` },
      400
    );
  }

  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return json(fail(null, ERR.PARSE, "Body was not valid JSON."), 400);
  }

  const { response, toolCalled } = await dispatch(message, TOOLS, SERVER);

  if (toolCalled) {
    /*
      EVERY READ IS RECORDED, WITH A NAME ON IT, after the response rather than
      before it.

      This endpoint can return a student's passport number and their bank
      details to whoever holds a key. An access log is the difference between
      knowing that happened and finding out later, and `actorId` is what makes
      it answer "who" rather than only "what" — the reason personal keys exist
      at all.

      The tool name and its arguments go in; nothing the query returned does.
      The audit helper strips anything token-shaped as a backstop.
    */
    const args = (message as { params?: { arguments?: unknown } })?.params?.arguments;
    after(
      audit({
        action: "mcp.read",
        actorId: caller.userId,
        actorEmail: caller.actorEmail,
        entity: "mcp_tool",
        entityId: toolCalled,
        meta: { tool: toolCalled, args: JSON.stringify(args ?? {}).slice(0, 400) },
        ip,
      })
    );

    // Its own statement, and after the answer: "is anybody still using this
    // key" is the only question that makes an old one safe to withdraw, and a
    // slow write must never hold up a read.
    if (caller.tokenId) after(mcpTokens.touch(caller.tokenId));
    if (caller.oauthTokenId) after(oauth.touchToken(caller.oauthTokenId));
  }

  // A notification carries no id and gets no body — just an acknowledgement.
  if (!response) return new NextResponse(null, { status: 202 });

  return json(response);
}

/**
 * The transport allows a GET that opens a stream for server-initiated
 * messages. This server never initiates anything — it answers when asked —
 * and the spec's answer for that case is 405, which clients handle.
 */
export function GET() {
  return json({ error: "This server does not offer a server-initiated stream." }, 405);
}

/** No sessions are kept, so there is nothing for a client to end. */
export function DELETE() {
  return json({ error: "This server does not use sessions." }, 405);
}

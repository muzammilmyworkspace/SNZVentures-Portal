import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { checkToken, originAllowed } from "@/lib/mcp/auth";
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

export async function POST(request: Request) {
  if (!env("MCP_TOKEN")) {
    return json({ error: "This endpoint is not configured." }, 503);
  }
  if (!originAllowed(request.headers.get("origin"), request.url)) {
    return json({ error: "Origin not allowed." }, 403);
  }
  if (!checkToken(request.headers.get("authorization"), env("MCP_TOKEN"))) {
    // No detail about which half was wrong. A 401 that distinguishes "no
    // token" from "wrong token" is a probe telling an attacker they are close.
    return json({ error: "Unauthorized." }, 401);
  }

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
      EVERY READ IS RECORDED, after the response rather than before it.

      This endpoint can return a student's passport number and their bank
      details, to whoever holds the token. An access log is the difference
      between knowing that happened and finding out later — and it is far
      easier to add now than to reconstruct afterwards.

      The tool name and its arguments go in; nothing the query returned does.
      The audit helper strips anything token-shaped as a backstop.
    */
    const args = (message as { params?: { arguments?: unknown } })?.params?.arguments;
    after(
      audit({
        action: "mcp.read",
        actorEmail: "mcp",
        entity: "mcp_tool",
        entityId: toolCalled,
        meta: { tool: toolCalled, args: JSON.stringify(args ?? {}).slice(0, 400) },
        ip,
      })
    );
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

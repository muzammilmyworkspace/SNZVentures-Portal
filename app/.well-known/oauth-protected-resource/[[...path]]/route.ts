import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/oauth/server";
import { originFrom } from "@/lib/oauth/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RFC 9728 — where to go and ask for a token.
 *
 * A CATCH-ALL SEGMENT, DELIBERATELY. Claude finds this document one of two
 * ways: the `resource_metadata` pointer in our 401, or by probing the origin.
 * The probe tries `/.well-known/oauth-protected-resource/api/mcp` — the MCP
 * path appended — BEFORE the bare path. Serving only the bare one means the
 * first probe 404s, and a discovery failure reads as "couldn't reach the
 * server" while pointing at nothing.
 *
 * Both spellings return the same document, because there is one MCP server
 * here and one authorization server.
 */
export async function GET(request: Request) {
  return NextResponse.json(protectedResourceMetadata(originFrom(request)), {
    headers: {
      // Read by a client that has just been refused, so it must not be served
      // from a cache that predates a change of address.
      "cache-control": "public, max-age=300",
      // Discovery is fetched by clients on other origins; without this the
      // browser-based ones cannot read it.
      "access-control-allow-origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
    },
  });
}

import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/oauth/server";
import { originFrom } from "@/lib/oauth/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RFC 8414 — what this authorization server can do.
 *
 * A spec-compliant client reads this BEFORE starting and refuses to begin if
 * `code_challenge_methods_supported` does not list S256. So an omission here
 * does not produce a weaker flow, it produces no flow at all, with an error
 * that names nothing.
 */
export async function GET(request: Request) {
  return NextResponse.json(authorizationServerMetadata(originFrom(request)), {
    headers: {
      "cache-control": "public, max-age=300",
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
      "access-control-allow-headers": "authorization, content-type",
    },
  });
}

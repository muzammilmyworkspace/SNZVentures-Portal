import { NextResponse } from "next/server";
import { googleConfigured, googleAuthUrl, createState } from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start Google sign-in.
 *
 * Redirects to Google with a signed, expiring `state`. If OAuth is not
 * configured, the visitor is sent back to /login with an explanatory flag
 * rather than to a Google error page — a dead end that says nothing is worse
 * than a sentence telling them to use their password instead.
 */
export async function GET(request: Request) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?oauth=unavailable", request.url));
  }

  const next = new URL(request.url).searchParams.get("next") ?? undefined;
  return NextResponse.redirect(googleAuthUrl(createState(next)));
}

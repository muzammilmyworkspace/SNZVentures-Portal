import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * GOOGLE SIGN-IN
 * ---------------------------------------------------------------------------
 * Authorization Code flow, run entirely server-side against the existing
 * session system in lib/auth/session.ts. It does NOT introduce a second auth
 * stack — a successful Google sign-in ends with the same signed session cookie
 * that a password sign-in produces, so every guard in the app keeps working
 * unchanged.
 *
 * NOT CONFIGURED BY DEFAULT, AND HONEST ABOUT IT. Without both variables,
 * `googleConfigured()` is false, the button is not rendered, and the routes
 * return 503 with an explanation. Nothing here invents a credential and there
 * is no fallback client id.
 *
 * SECURITY NOTES
 *
 *  • `client_secret` is read from the environment inside a `server-only`
 *    module. It is never sent to the browser and has no NEXT_PUBLIC_ prefix.
 *
 *  • CSRF is handled with a signed, expiring `state` value rather than a
 *    server-side store, matching how sessions already work here. The signature
 *    is over a random nonce plus an expiry, so a state cannot be replayed after
 *    ten minutes or forged without AUTH_SECRET.
 *
 *  • The ID token is NOT signature-verified locally, and that is correct here:
 *    it is received directly from Google's token endpoint over TLS in a
 *    server-to-server call, which is the case Google's own documentation
 *    exempts from local verification. Claims (`iss`, `aud`, `exp`) are still
 *    checked, because TLS proves who sent the token, not what is inside it.
 *    If this ever moves to accepting an ID token from the BROWSER, full JWKS
 *    signature verification becomes mandatory.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const STATE_TTL_SECONDS = 600;

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Absolute callback URL. Must match a redirect URI registered in Google Cloud.
 *
 * The fallback used to be localhost, which is right on a laptop and completely
 * wrong on Vercel — a deployment without NEXT_PUBLIC_SITE_URL sent people to a
 * machine that isn't there. `VERCEL_PROJECT_PRODUCTION_URL` only exists on the
 * platform, so local development keeps the localhost behaviour untouched.
 *
 * Whatever this returns must be registered verbatim in Google Cloud; Google
 * compares the string, not the host.
 */
export function googleRedirectUri(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const platform = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const base = explicit
    ? explicit
    : platform
      ? `https://${platform.replace(/^https?:\/\//, "")}`
      : "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/api/auth/google/callback`;
}

/* ------------------------------------------------------------------ state */

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function stateSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is required for OAuth state signing.");
  return s;
}

/**
 * `<expiry>.<nonce>.<next>.<signature>`.
 * `next` is carried through so the visitor lands where they were headed, but
 * it is validated as an internal path on the way back out — an open redirect
 * through the OAuth callback would be a genuine phishing vector.
 */
export function createState(next?: string): string {
  const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
  const nonce = b64url(randomBytes(16));
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  const payload = `${exp}.${nonce}.${b64url(Buffer.from(dest))}`;
  const sig = b64url(createHmac("sha256", stateSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyState(state: string | null): { ok: boolean; next: string } {
  if (!state) return { ok: false, next: "/portal" };
  const parts = state.split(".");
  if (parts.length !== 4) return { ok: false, next: "/portal" };

  const [exp, nonce, dest, sig] = parts;
  const expected = createHmac("sha256", stateSecret())
    .update(`${exp}.${nonce}.${dest}`)
    .digest();
  const given = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  if (given.length !== expected.length) return { ok: false, next: "/portal" };
  if (!timingSafeEqual(given, expected)) return { ok: false, next: "/portal" };
  if (Number(exp) < Math.floor(Date.now() / 1000)) return { ok: false, next: "/portal" };

  const decoded = Buffer.from(dest.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  // Re-checked on the way out, not just on the way in.
  const safe = decoded.startsWith("/") && !decoded.startsWith("//") ? decoded : "/portal";
  return { ok: true, next: safe };
}

/* -------------------------------------------------------------- the flow */

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // We only need identity, so no refresh token is requested and none is
    // stored. Less to keep, less to leak.
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export type GoogleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

/** Exchange the one-time code for an ID token, then read the identity out of it. */
export async function exchangeCode(code: string): Promise<GoogleIdentity | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error("[oauth] token exchange failed:", res.status);
    return null;
  }

  const data = (await res.json().catch(() => null)) as { id_token?: string } | null;
  if (!data?.id_token) return null;

  const parts = data.id_token.split(".");
  if (parts.length !== 3) return null;

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );
  } catch {
    return null;
  }

  // Claim checks. TLS established WHO sent this; these establish what it says.
  if (!ISSUERS.has(String(claims.iss))) return null;
  if (String(claims.aud) !== process.env.GOOGLE_CLIENT_ID) return null;
  if (Number(claims.exp) * 1000 < Date.now()) return null;

  const email = typeof claims.email === "string" ? claims.email : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!email || !subject) return null;

  return {
    subject,
    email,
    // Google sends this as a boolean or the string "true" depending on flow.
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: typeof claims.name === "string" && claims.name ? claims.name : email.split("@")[0],
    picture: typeof claims.picture === "string" ? claims.picture : null,
  };
}

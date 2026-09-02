import { createHash, timingSafeEqual } from "node:crypto";

/**
 * THE OAUTH RULES, WITH NO DATABASE AND NO NETWORK.
 * ---------------------------------------------------------------------------
 * Everything here decides whether something is allowed, and every one of those
 * decisions is a security boundary that fails open if it is written wrongly —
 * a PKCE check that accepts any verifier, a redirect match that accepts a
 * lookalike host. None of that shows up in use: the flow works either way, and
 * only an attacker notices the difference.
 *
 * So it is kept out of the route handlers, imports nothing but `node:crypto`,
 * and is exercised directly by `npm run verify:oauth`.
 */

/** The scope this server issues. One resource, one permission, read-only. */
export const SCOPE_READ = "portal:read";

/** Asked for by Claude when advertised, and required to get a refresh token. */
export const SCOPE_OFFLINE = "offline_access";

export const SCOPES_SUPPORTED = [SCOPE_READ, SCOPE_OFFLINE];

/** Where the hosted Claude surfaces return to. Registered by name so a
 *  dynamically registered client claiming it is recognisable in the logs. */
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

/** Codes live minutes, not hours: long enough for a slow browser redirect,
 *  short enough that one captured from a log is almost always already dead. */
export const CODE_TTL_SECONDS = 300;

/** An hour. Short by design — a leaked access token expires on its own, and
 *  the refresh token is what carries the long-lived permission. */
export const ACCESS_TTL_SECONDS = 3600;

/** Thirty days, rotated on every use. */
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const b64url = (b: Buffer) => b.toString("base64url");

/**
 * PKCE, S256 only.
 *
 * `plain` is deliberately not supported. It offers no protection — the
 * "challenge" is the verifier — and accepting it would let a client that has
 * had its authorization code intercepted be impersonated, which is the exact
 * attack PKCE exists to stop. Claude always sends S256, so there is nothing
 * to be compatible with.
 *
 * Compared in constant time: the challenge is attacker-supplied, and a
 * byte-by-byte comparison that returns early leaks how much of a guess was
 * right.
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  // RFC 7636: 43-128 characters of unreserved ASCII. A verifier shorter than
  // this has too little entropy for the check to mean anything.
  if (verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;

  const expected = b64url(createHash("sha256").update(verifier).digest());
  const a = Buffer.from(sha256(expected), "utf8");
  const b = Buffer.from(sha256(challenge), "utf8");
  return timingSafeEqual(a, b);
}

/**
 * Is this a loopback address the way RFC 8252 means it?
 *
 * Native clients — Claude Code among them — listen on an ephemeral port and
 * cannot know it in advance, so they register `http://localhost/callback` and
 * arrive on `http://localhost:51234/callback`. Section 7.3 requires the port
 * to be ignored for these, and ONLY for these.
 */
function isLoopback(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

/**
 * Exact match, with the one exception the specification carves out.
 *
 * THE FAILURE THIS PREVENTS: an authorization server that matches redirect
 * URIs by prefix or by "starts with the registered host" can be handed
 * `https://claude.ai.attacker.example/…` or `https://claude.ai/api/mcp/auth_callback/../../evil`
 * and will happily deliver somebody's authorization code to it. Comparing
 * parsed URLs component by component — not strings, not prefixes — is what
 * makes that impossible.
 */
export function redirectUriAllowed(requested: string, registered: readonly string[]): boolean {
  let asked: URL;
  try {
    asked = new URL(requested);
  } catch {
    return false;
  }

  // Anything not on the loopback interface must be HTTPS. An http:// redirect
  // puts the code on the wire in the clear.
  if (asked.protocol !== "https:" && !isLoopback(asked)) return false;
  if (asked.hash) return false;

  return registered.some((candidate) => {
    let known: URL;
    try {
      known = new URL(candidate);
    } catch {
      return false;
    }
    if (known.protocol !== asked.protocol) return false;
    if (known.hostname !== asked.hostname) return false;
    if (known.pathname !== asked.pathname) return false;

    // The port is ignored for loopback and compared for everything else.
    if (isLoopback(known) && isLoopback(asked)) return true;
    return known.port === asked.port;
  });
}

/**
 * The canonical URI of this MCP server, as RFC 8707 defines it.
 *
 * Compared with what the client asks for, so a token can only be used at the
 * server it was granted for. Without this an access token minted here would
 * be accepted by any other MCP server that trusted this issuer, which is the
 * confused-deputy problem the spec spends a section on.
 *
 * Normalised because a client may reasonably send a trailing slash or an
 * uppercase host, and refusing those is an interoperability failure rather
 * than a security win.
 */
export function canonicalResource(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.hash) return null;
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

export function resourceMatches(asked: string | null, actual: string): boolean {
  if (!asked) return true; // Older clients omit it; the audience is then implicit.
  const a = canonicalResource(asked);
  const b = canonicalResource(actual);
  return a !== null && b !== null && a === b;
}

/**
 * RFC 9728. Tells a client where to go and ask for a token.
 *
 * `resource` MUST equal the MCP server URL exactly as the person typed it
 * into Claude, path included — a mismatch here is the commonest reason a
 * connector reaches the server and then never reaches the token endpoint.
 */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: SCOPES_SUPPORTED,
    bearer_methods_supported: ["header"],
    resource_name: "SnZ Ventures portal",
  };
}

/**
 * RFC 8414. What this authorization server supports.
 *
 * `code_challenge_methods_supported` is not decoration: a spec-compliant
 * client checks for S256 here before starting, and refuses to begin without
 * it. Omitting it fails the flow before a single request is made.
 *
 * `registration_endpoint` is what makes this work with no setup at all —
 * Claude registers itself on first connection rather than anybody creating a
 * client by hand.
 */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/portal/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: SCOPES_SUPPORTED,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // "none" because Claude registers as a public client: it runs in a browser
    // or on somebody's laptop and has nowhere to keep a secret. PKCE, not a
    // client secret, is what proves the token request came from whoever
    // started the flow.
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${origin}/portal/admin/integrations`,
  };
}

/** RFC 6749 §5.2 error shapes. The codes matter: Claude retries a refresh on
 *  `invalid_grant` and gives up on anything else, so a wrong code here turns
 *  an expired token into a connector that never recovers. */
export type OAuthError =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "access_denied"
  | "server_error";

export const oauthError = (error: OAuthError, description: string) => ({
  error,
  error_description: description,
});

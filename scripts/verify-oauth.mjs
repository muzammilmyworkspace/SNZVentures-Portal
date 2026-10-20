/**
 * THE CHECKS THAT FAIL OPEN.
 *
 *   npm run verify:oauth
 *
 * Every decision in lib/oauth/server.ts is a security boundary, and each one
 * has the same property: if it is written wrongly the flow still works
 * perfectly. A PKCE check that accepts any verifier, a redirect match that
 * accepts a lookalike host — nobody connecting notices either. Only somebody
 * attacking does.
 *
 * So they are exercised directly, with the attacks written out, rather than
 * inferred from the fact that connecting works.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  verifyPkce,
  redirectUriAllowed,
  canonicalResource,
  resourceMatches,
  protectedResourceMetadata,
  authorizationServerMetadata,
  CLAUDE_CALLBACK,
  SCOPES_SUPPORTED,
} from "../lib/oauth/server.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/**
 * Does this list of selected columns hand back a stored secret?
 *
 * The distinction is between RETURNING the digest and ASKING A QUESTION about
 * it. `secret_hash` on its own loads a credential into application memory,
 * where it can reach a log line or an error dump. `(secret_hash IS NOT NULL)
 * AS has_secret` returns a boolean and leaves the digest in the table — which
 * is the pattern we want, so the check must not condemn it.
 *
 * Parenthesised expressions are removed before looking, which is exactly that
 * distinction: a bare column is not inside brackets, and a test of one is.
 */
function selectsSecret(columns) {
  let stripped = columns;
  let previous;
  do {
    previous = stripped;
    stripped = stripped.replace(/\([^()]*\)/g, " ");
  } while (stripped !== previous);
  return /\b(token_hash|secret_hash)\b/i.test(stripped);
}

/* The check is only worth having if it still catches the thing it is for. */
if (!selectsSecret("id, token_hash, payload")) fail("selectsSecret misses a bare hash column");
if (!selectsSecret("t.secret_hash AS s")) fail("selectsSecret misses a qualified hash column");
if (selectsSecret("id, (secret_hash IS NOT NULL) AS has_secret")) {
  fail("selectsSecret condemns a boolean derived in the database");
}

const ORIGIN = "https://portal.snzventures.com";
const challengeFor = (verifier) =>
  createHash("sha256").update(verifier).digest("base64url");

/* ------------------------------------------------------------------ PKCE */

console.log("\n=== PKCE ===");
{
  const verifier = randomBytes(48).toString("base64url"); // 64 chars
  const challenge = challengeFor(verifier);

  if (!verifyPkce(verifier, challenge)) fail("a correct verifier was rejected");
  ok("a correct verifier is accepted");

  /*
    THE ATTACK PKCE EXISTS TO STOP: somebody who intercepted the authorization
    code redeems it with a verifier of their own. Every one of these must fail.
  */
  const attacks = [
    [randomBytes(48).toString("base64url"), challenge, "a different verifier"],
    [verifier, challengeFor(randomBytes(48).toString("base64url")), "a different challenge"],
    ["", challenge, "an empty verifier"],
    [verifier, "", "an empty challenge"],
    [verifier.slice(0, 20), challengeFor(verifier.slice(0, 20)), "a verifier below 43 characters"],
    ["a".repeat(200), challengeFor("a".repeat(200)), "a verifier above 128 characters"],
    ["a".repeat(50) + "!", challengeFor("a".repeat(50) + "!"), "a verifier with illegal characters"],
    /*
      PLAIN PKCE, WHICH IS NO PKCE. If `plain` were honoured, the challenge IS
      the verifier — so whoever stole the code already has everything needed.
      Sending the verifier as its own challenge must not pass.
    */
    [verifier, verifier, "the plain method, where the challenge is the verifier"],
  ];
  for (const [v, c, what] of attacks) {
    if (verifyPkce(v, c)) fail(`${what} was accepted`);
  }
  ok(`${attacks.length} bad verifier/challenge pairs all refused, including plain`);
}

/* -------------------------------------------------------- redirect URIs */

console.log("\n=== where a code may be sent ===");
{
  const registered = [CLAUDE_CALLBACK, "http://localhost/callback", "http://127.0.0.1/callback"];

  if (!redirectUriAllowed(CLAUDE_CALLBACK, registered)) fail("Claude's own callback was refused");

  /*
    RFC 8252 §7.3. A native client listens on an ephemeral port it cannot know
    in advance, so the port is ignored for loopback — and ONLY for loopback.
  */
  for (const uri of [
    "http://localhost:51234/callback",
    "http://127.0.0.1:8080/callback",
    "http://localhost/callback",
  ]) {
    if (!redirectUriAllowed(uri, registered)) fail(`the loopback redirect ${uri} was refused`);
  }
  ok("Claude's callback and loopback on any port are accepted");

  /*
    THE OPEN-REDIRECT ATTACKS. An authorization server that matches by prefix,
    by "starts with", or by substring will hand somebody's authorization code
    to the attacker's site. Each of these is a real shape that has worked
    against real implementations.
  */
  const attacks = [
    ["https://claude.ai.attacker.example/api/mcp/auth_callback", "a lookalike domain"],
    ["https://attacker.example/api/mcp/auth_callback", "the right path on the wrong host"],
    ["https://claude.ai/api/mcp/auth_callback/../../evil", "a path traversal"],
    ["https://claude.ai/api/mcp/auth_callback2", "a path that merely starts the same"],
    ["https://claude.ai/evil", "the right host with a different path"],
    ["http://claude.ai/api/mcp/auth_callback", "the same URL over plain http"],
    ["https://claude.ai:8443/api/mcp/auth_callback", "a different port on a non-loopback host"],
    ["https://evil.example:1/#https://claude.ai/api/mcp/auth_callback", "a fragment carrying the real one"],
    ["//claude.ai/api/mcp/auth_callback", "a protocol-relative URL"],
    ["not a url", "something that is not a URL at all"],
    ["", "an empty string"],
    ["http://localhost.attacker.example/callback", "a host that merely begins with localhost"],
  ];
  for (const [uri, what] of attacks) {
    if (redirectUriAllowed(uri, registered)) fail(`${what} was accepted: ${uri}`);
  }
  ok(`${attacks.length} redirect attacks refused, including lookalikes and traversal`);

  if (redirectUriAllowed(CLAUDE_CALLBACK, [])) fail("a client with no registered URI accepted one");
  ok("a client that registered nothing can be sent nothing");
}

/* ------------------------------------------------------- audience binding */

console.log("\n=== which server a token is for ===");
{
  const mcp = `${ORIGIN}/api/mcp`;

  if (canonicalResource("HTTPS://Portal.SnZVentures.com/api/mcp/") !== mcp) {
    fail("case and a trailing slash were not normalised");
  }
  if (canonicalResource("https://x.example/a#frag") !== null) fail("a fragment was accepted");
  if (canonicalResource("nonsense") !== null) fail("a non-URL was accepted");

  if (!resourceMatches(mcp, mcp)) fail("the right resource did not match");
  if (!resourceMatches(null, mcp)) fail("an omitted resource was not allowed");

  /* Without this, a token minted here would be spendable at any other MCP
     server that trusted the same issuer — the confused-deputy problem. */
  for (const other of [
    "https://attacker.example/api/mcp",
    "https://portal.snzventures.com.attacker.example/api/mcp",
    "https://portal.snzventures.com/api/other",
  ]) {
    if (resourceMatches(other, mcp)) fail(`a token for ${other} was accepted here`);
  }
  ok("a token is usable only at the server it was granted for");
}

/* ------------------------------------------------------------- discovery */

console.log("\n=== what we advertise ===");
{
  const prm = protectedResourceMetadata(ORIGIN);
  if (prm.resource !== `${ORIGIN}/api/mcp`) fail("the resource does not name the MCP endpoint");
  if (prm.authorization_servers?.[0] !== ORIGIN) fail("no authorization server is listed first");

  const asm = authorizationServerMetadata(ORIGIN);

  /*
    A COMPLIANT CLIENT READS THIS BEFORE IT STARTS and refuses to begin when
    S256 is absent. Omitting it does not weaken the flow, it prevents it —
    with an error that names nothing.
  */
  if (JSON.stringify(asm.code_challenge_methods_supported) !== JSON.stringify(["S256"])) {
    fail("S256 is not advertised as the code challenge method");
  }
  if (asm.issuer !== ORIGIN) fail("the issuer is wrong");
  for (const key of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) {
    if (!String(asm[key] ?? "").startsWith(ORIGIN)) fail(`${key} is not on this origin`);
  }
  /* Claude registers as a public client, so the token endpoint has to accept
     one that presents no secret. Without "none" here it falls back and fails. */
  if (!asm.token_endpoint_auth_methods_supported?.includes("none")) {
    fail("public clients are not advertised as acceptable at the token endpoint");
  }
  if (!asm.scopes_supported?.includes("offline_access")) {
    fail("offline_access is not advertised, so no refresh token is ever requested");
  }
  if (JSON.stringify(asm.scopes_supported) !== JSON.stringify(SCOPES_SUPPORTED)) {
    fail("the advertised scopes do not match the ones issued");
  }
  ok("both discovery documents state what a client needs before it will start");
}

/* --------------------------------------------------------- the endpoints */

console.log("\n=== the routes still do what the flow needs ===");
{
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  const mcp = read("app/api/mcp/route.ts");
  /* Claude honours WWW-Authenticate only on a 401. Without it a connector has
     nothing to discover and fails with "couldn't reach the server". */
  if (!/www-authenticate/i.test(mcp)) fail("the 401 no longer points at the resource metadata");
  if (!mcp.includes("resource_metadata=")) fail("the WWW-Authenticate header lost resource_metadata");
  if (!mcp.includes("resourceMatches")) fail("access tokens are no longer audience-checked");

  const token = read("app/api/oauth/token/route.ts");
  if (!token.includes("verifyPkce")) fail("the token endpoint no longer verifies PKCE");
  if (!token.includes("consumeCode")) fail("the token endpoint no longer consumes the code");
  /* Claude retries on invalid_grant and gives up on anything else, so the
     wrong code here turns an expired token into a permanently broken
     connector. */
  if (!token.includes('"invalid_grant"')) fail("refresh failures no longer return invalid_grant");
  if (!token.includes("revokeChain")) fail("a reused refresh token no longer revokes its chain");
  /* RFC 6749 §4.1.3: the token endpoint is form-urlencoded, not JSON. A
     JSON-only parser returns 415 after the person has already approved. */
  if (!token.includes("formData()")) fail("the token endpoint no longer reads a form body");

  const authorize = read("app/api/oauth/authorize/route.ts");
  /* Without an Origin check another site could submit the consent form in a
     signed-in admin's browser and be granted access they never saw. */
  if (!authorize.includes('request.headers.get("origin")')) {
    fail("the consent POST no longer refuses cross-site submissions");
  }
  if (!authorize.includes("impersonator")) {
    fail("a view-as session can now grant long-lived access in somebody else's name");
  }
  if (!authorize.includes("getClient")) fail("the consent POST no longer re-checks the client");

  const page = read("app/portal/oauth/authorize/page.tsx");
  if (!page.includes('challengeMethod !== "S256"')) fail("the consent screen no longer requires PKCE");
  ok("401 discovery, PKCE, single-use codes, CSRF and view-as are all still enforced");

  const repo = read("lib/db/repos/oauth.ts");
  for (const [, columns] of repo.matchAll(/SELECT\b([\s\S]*?)\bFROM\b/gi)) {
    if (selectsSecret(columns)) fail(`a query returns a stored secret: ${columns.trim().slice(0, 80)}`);
  }
  if (!repo.includes("u.status = 'active'")) fail("access tokens no longer re-check the account");
  ok("no secret is ever selected back out, and the account is re-checked on use");
}

console.log(failures === 0 ? "\n  OAuth verified.\n" : `\n  ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);

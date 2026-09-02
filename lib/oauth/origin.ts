/**
 * THIS DEPLOYMENT'S OWN PUBLIC ADDRESS.
 *
 * Every OAuth document has to state absolute URLs, and they have to be the
 * ones a client outside can actually reach. `request.url` is not that: behind
 * Vercel's proxy it is an internal address, and a discovery document that
 * advertises an internal host sends Claude somewhere it cannot go — a failure
 * that looks like "couldn't reach the server" and points at nothing.
 *
 * Read from the forwarded headers instead, which is what the proxy rewrites
 * for exactly this purpose. Falls back to the request's own origin so it still
 * works when nothing is in front of it, such as `next start` locally.
 */
export function originFrom(request: Request): string {
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return new URL(request.url).origin;

  // http only for a local host; anything reachable from outside is https, and
  // an OAuth endpoint advertised over http is one that leaks a code.
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");

  return `${proto}://${host}`;
}

/**
 * WHERE THE PORTAL LIVES — one definition, used by every CTA on the site.
 *
 * The portal is part of THIS application: `/login`, `/register`, `/portal`.
 * That is the default, and it works today with no configuration.
 *
 * It is also expected to be served from its own subdomain eventually. When
 * that happens, set NEXT_PUBLIC_PORTAL_URL to the origin (for example
 * `https://student.snzventures.com`) and every portal link on the public site
 * re-points at once. Without this module those links were nine separate
 * hardcoded `/login` strings, and moving the portal meant finding all nine.
 *
 * NOT the same thing as the reference/marketing site. student.snzventures.com
 * currently serves a marketing homepage, not a sign-in page, so pointing these
 * CTAs there before the portal is deployed to it would send clients somewhere
 * that cannot log them in. The default stays internal until that is true.
 *
 * NEXT_PUBLIC_ is correct here: this is a public URL rendered into anchor
 * hrefs, not a secret.
 */

const configured = process.env.NEXT_PUBLIC_PORTAL_URL?.trim().replace(/\/+$/, "");

/** True when the portal is served from a different origin to the public site. */
export const isExternalPortal = Boolean(configured);

function portalPath(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return configured ? `${configured}${clean}` : clean;
}

export const portalUrls = {
  /** Sign in. */
  login: portalPath("/login"),
  /** Create an account — the pathway chooser is step one. */
  register: portalPath("/register"),
  /** Password recovery. */
  forgot: portalPath("/forgot-password"),
  /** The authenticated dashboard itself. */
  dashboard: portalPath("/portal"),
} as const;

/**
 * Anchor props for a portal link. On a cross-origin portal a link must not
 * carry the referrer or opener, so this returns the safe attributes with it —
 * getting that right at every call site by hand is how one gets missed.
 */
export function portalLinkProps(target: keyof typeof portalUrls = "login") {
  return isExternalPortal
    ? { href: portalUrls[target], rel: "noopener noreferrer" as const }
    : { href: portalUrls[target] };
}

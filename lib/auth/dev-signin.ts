import "server-only";

/**
 * ONE-CLICK SIGN-IN, FOR A DEVELOPER'S OWN MACHINE ONLY.
 *
 * This is an authentication bypass. Everything about it is written on the
 * assumption that it will one day be deployed by accident, so the question is
 * not "is it switched off" but "what would it take to switch it ON in
 * production" — and the answer has to be: nothing anybody can do by mistake.
 *
 * THREE INDEPENDENT GATES, all of which must hold:
 *
 *  1. NODE_ENV must not be production. `next build` sets it, so every
 *     deployment fails this — including a preview, and including someone
 *     running `next start` on their laptop.
 *
 *  2. VERCEL must be unset. Set on every Vercel build and runtime, so even a
 *     deployment that somehow ran in development mode fails here.
 *
 *  3. The database must be on this machine. This is the one that matters. The
 *     first two describe how the code is RUNNING; this one describes what it
 *     is running AGAINST, and the actual disaster is a dev server pointed at
 *     the production database handing out an admin session. A hosted database
 *     is never on 127.0.0.1, so that cannot happen.
 *
 * Any one of them failing is enough. There is deliberately no environment
 * variable that turns this on, because a variable is exactly the thing that
 * gets copied into a deployment.
 */

function databaseIsLocal(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    // An unparseable URL is not a local one as far as this is concerned.
    return false;
  }
}

export function devSignInAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    databaseIsLocal()
  );
}

/**
 * The accounts the button offers.
 *
 * A fixed list rather than "any account": the point is to skip typing a
 * password on a throwaway database, not to build a general impersonation tool.
 * `.test` is a reserved TLD that can never resolve, so these addresses cannot
 * collide with a real one.
 *
 * `student` is the address the seeded example student uses — see the local
 * setup notes in scripts/dev-db.mjs.
 */
export const DEV_ACCOUNTS = [
  { key: "admin", label: "Super admin", email: "admin@local.test" },
  { key: "consultant", label: "Consultant", email: "consultant@local.test" },
  { key: "student", label: "Student", email: "ayesha@example.com" },
] as const;

export type DevAccountKey = (typeof DEV_ACCOUNTS)[number]["key"];

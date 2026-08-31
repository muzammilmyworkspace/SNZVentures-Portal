import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PortalShell, type Badges } from "@/components/portal/PortalShell";
import * as repo from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Client Portal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Every /portal route is dynamic and uncached.
 *
 * Two reasons, both load-bearing. A cached shell could serve one signed-in
 * person's name and counts to the next. And after signing out, a cached page in
 * the browser's back-forward store would still show the dashboard — with this,
 * Back re-requests and meets the guard below.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server-side authorisation for every /portal route.
 *
 * Proxy only checks that a cookie is PRESENT; this is where the signature is
 * verified. Every page under /portal is therefore guaranteed a real session.
 * Pages that need a narrower role still call their own guard — this one only
 * establishes that somebody is signed in.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Through the clearing route — see lib/auth/guard.ts for why not /login.
  if (!session) redirect("/api/auth/expired?next=/portal");

  /*
    Sidebar counts, computed here so every page shows the same numbers rather
    than each recomputing them. Degrades to no badges when the database is
    unreachable — a missing badge is a far better failure than a broken shell.

    ONE query, not four.

    This began as four calls behind a Promise.all. On the `max: 1` pool that
    serverless needs, those serialise into four network round trips on every
    portal page — and with the function in one region and the database in
    another, that alone was enough to hit the gateway timeout. It is now a
    single statement returning all four counts.
  */
  const badges: Badges = isDatabaseConfigured()
    ? await repo.getSidebarBadges(session.userId, session.role)
    : {};

  return (
    <PortalShell name={session.name} role={session.role} badges={badges}>
      {children}
    </PortalShell>
  );
}

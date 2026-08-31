import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { PortalShell, type Badges } from "@/components/portal/PortalShell";
import * as repo from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { studentStage, pathOpen, lockReason } from "@/lib/portal/stage";
import { navFor, portalRoleFor } from "@/lib/portal/roles";

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
/**
 * The header line, per stage.
 *
 * Deliberately phrased as WHOSE MOVE IT IS. "Fee review" describes a database
 * row; "Receipt with us" tells somebody they can stop refreshing.
 */
const HEADER_STATUS: Record<string, { label: string; tone: "ok" | "wait" | "action" }> = {
  fee_due: { label: "Send your receipt", tone: "action" },
  fee_review: { label: "Receipt with us", tone: "wait" },
  fee_rejected: { label: "Receipt needs re-sending", tone: "action" },
  application: { label: "Application open", tone: "action" },
  consent_due: { label: "Undertaking to sign", tone: "action" },
  complete: { label: "With your advisor", tone: "ok" },
};

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

  /*
    THE GATE, RESOLVED ONCE PER NAVIGATION.

    Only students have one — a job seeker or a business has no fee stage, so
    asking for it would be a wasted round trip on every page they open.

    This produces the LIST of locked hrefs rather than passing the stage down.
    PortalShell is a client component; handing it a stage would mean shipping
    the stage rules to the browser and keeping two copies of them in step. A
    list of strings cannot drift from the rules that produced it.
  */
  let lockedPaths: string[] = [];
  let lockNote: string | null = null;
  let status: { label: string; tone: "ok" | "wait" | "action" } | null = null;

  if (session.role === "student" && isDatabaseConfigured()) {
    const { stage } = await studentStage(session.userId);
    lockNote = lockReason(stage);
    status = HEADER_STATUS[stage];
    lockedPaths = navFor[portalRoleFor(session.role)]
      .flatMap((g) => g.items)
      .map((i) => i.href)
      .filter((href) => !pathOpen(href, stage));
  }

  return (
    <PortalShell
      name={session.name}
      role={session.role}
      badges={badges}
      lockedPaths={lockedPaths}
      lockNote={lockNote}
      status={status}
    >
      {children}
    </PortalShell>
  );
}

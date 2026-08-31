import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { getAdminOverview, getQueryAnalytics } from "@/lib/db/repos/portal";
import { PortalHeading, Panel, StatCard, EmptyState } from "@/components/portal/Pieces";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

/**
 * QUERY ANALYTICS — real counts, or nothing.
 *
 * Every figure is a COUNT over rows that exist. With an empty database this
 * page shows zeroes and says so, because a dashboard that invents plausible
 * numbers to look busy is worse than an empty one: someone eventually quotes
 * them.
 *
 * The bars are proportional divs rather than a charting library. A dependency
 * that ships a canvas renderer to draw six horizontal bars is a poor trade,
 * and these stay readable in both themes and at any width.
 */

const STATUS_LABEL: Record<string, string> = {
  submitted: "New",
  under_review: "Under review",
  accepted: "Completed",
  returned: "Waiting for user",
  draft: "Draft (not submitted)",
};

const PATHWAY_LABEL: Record<string, string> = {
  study: "Students",
  career: "Job Seekers",
  business: "Businesses",
};

function Bars({
  rows,
  labels,
  empty,
}: {
  rows: { key: string; count: number }[];
  labels: Record<string, string>;
  empty: string;
}) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (!total) {
    return <p className="text-[0.85rem] leading-relaxed text-muted">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.count));

  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[0.85rem] text-fg">{labels[r.key] ?? r.key}</span>
            <span className="num text-[0.85rem] font-semibold text-fg-strong">
              {r.count}
              <span className="ml-1.5 text-[0.75rem] font-normal text-faint">
                {Math.round((r.count / total) * 100)}%
              </span>
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
            role="img"
            aria-label={`${labels[r.key] ?? r.key}: ${r.count} of ${total}`}
          >
            <div
              className="h-full rounded-full bg-moss-400"
              style={{ width: `${max ? (r.count / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage() {
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Operations" title="Analytics" />
        <NotConfigured what="Analytics" />
      </>
    );
  }

  // Two reads, both bounded. Kept apart from the dashboard's single query
  // because this page is opened far less often than that one.
  const [overview, analytics] = await Promise.all([
    getAdminOverview(1, 1, 1),
    getQueryAnalytics(),
  ]);

  const m = overview.metrics;

  return (
    <>
      <PortalHeading
        eyebrow="Operations"
        title="Analytics"
        lead="Every figure here is a live count. Nothing on this page is estimated or seeded."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total queries" value={m.totalQueries ?? 0} href="/portal/admin/requests" />
        <StatCard
          label="New, unopened"
          value={m.newQueries ?? 0}
          href="/portal/admin/requests?status=submitted"
          urgent={(m.newQueries ?? 0) > 0}
        />
        <StatCard label="Total users" value={m.totalUsers ?? 0} href="/portal/admin/users" />
        <StatCard label="Open cases" value={m.openCases ?? 0} href="/portal/admin/cases" />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Queries by audience">
          <Bars
            rows={[
              { key: "study", count: m.studentQueries ?? 0 },
              { key: "career", count: m.careerQueries ?? 0 },
              { key: "business", count: m.businessQueries ?? 0 },
            ]}
            labels={PATHWAY_LABEL}
            empty="No submitted queries yet. This fills in as clients complete their forms."
          />
        </Panel>

        <Panel title="Queries by status">
          <Bars
            rows={analytics.byStatus}
            labels={STATUS_LABEL}
            empty="Nothing submitted yet, so there is no status distribution to show."
          />
        </Panel>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Submitted over the last 12 weeks">
          {analytics.overTime.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing submitted yet"
              body="Once clients start submitting, this shows the weekly pattern."
            />
          ) : (
            <Bars
              rows={analytics.overTime.map((w) => ({ key: w.week, count: w.count }))}
              labels={Object.fromEntries(
                analytics.overTime.map((w) => [
                  w.week,
                  new Date(w.week).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                ])
              )}
              empty="No submissions in this window."
            />
          )}
        </Panel>

        <Panel title="Users by audience">
          <Bars
            rows={[
              { key: "study", count: m.students ?? 0 },
              { key: "career", count: m.professionals ?? 0 },
              { key: "business", count: m.businesses ?? 0 },
            ]}
            labels={PATHWAY_LABEL}
            empty="No client accounts yet."
          />
          <dl className="mt-5 border-t border-line pt-4 text-[0.85rem]">
            <div className="flex justify-between py-1">
              <dt className="text-faint">Documents awaiting review</dt>
              <dd className="num text-fg">{m.pendingDocuments ?? 0}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-faint">Unread messages</dt>
              <dd className="num text-fg">{m.unreadMessages ?? 0}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-faint">Upcoming consultations</dt>
              <dd className="num text-fg">{m.appointments ?? 0}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-faint">Completed cases</dt>
              <dd className="num text-fg">{m.completedCases ?? 0}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}

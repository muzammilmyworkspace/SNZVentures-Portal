import Link from "next/link";
import { cn } from "@/lib/utils";
import { ActivityChart } from "./DashboardCharts";
import { AgentBoard, Donut, Funnel, KpiCard } from "./InsightCharts";
import { DateRangeBar } from "./DateRangeBar";
import { Panel, EmptyState, StatusPill, DataRow } from "./Pieces";
import { Person } from "./Avatar";
import type { StudentInsights } from "@/lib/db/repos/dashboard";
import type { ResolvedRange } from "@/lib/portal/date-range";

/* ===========================================================================
   THE ADMIN HOME (Oct 2026)
   ---------------------------------------------------------------------------
   The portal serves study-abroad students only, so this page is about them:
   the work waiting on the team, four headline figures with their last 30
   days, how far the students have come, which plan they chose, which sales
   agents bring them, and the newest arrivals. Every figure is a real count.
   ======================================================================== */

const STAGE_PILL: Record<string, { label: string; tone: string }> = {
  fee_due: { label: "Fee due", tone: "pending" },
  fee_rejected: { label: "Receipt rejected", tone: "rejected" },
  fee_review: { label: "Receipt in review", tone: "submitted" },
  application: { label: "Application", tone: "in_progress" },
  consent_due: { label: "Consent due", tone: "in_progress" },
  complete: { label: "Submitted", tone: "completed" },
};

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Karachi" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function AdminHome({
  name,
  m,
  series,
  insights,
  range,
  pendingDocs,
}: {
  name: string;
  m: Record<string, number>;
  series: { day: string; signups: number; submitted: number }[];
  insights: StudentInsights;
  range: ResolvedRange;
  pendingDocs: { id: string; name: string; status: string; ownerName: string }[];
}) {
  const st = insights.stages;
  const n = (k: string) => st[k] ?? 0;
  const t = insights.totals;
  const days = insights.daily.map((d) => d.day);
  const col = (k: "signups" | "receipts" | "verified" | "applications") => insights.daily.map((d) => d[k]);

  const verifiedOrLater = n("application") + n("consent_due") + n("complete");
  const funnel = [
    { label: "Registered", value: t.students, href: "/portal/admin/users?role=students" },
    { label: "Plan chosen", value: insights.plans.one_time + insights.plans.installments },
    { label: "Receipt sent", value: n("fee_review") + verifiedOrLater, href: "/portal/admin/fees" },
    { label: "Fee verified", value: verifiedOrLater, href: "/portal/admin/students" },
    { label: "Application submitted", value: n("consent_due") + n("complete"), href: "/portal/admin/requests" },
    { label: "Consent signed", value: n("complete"), href: "/portal/admin/ready" },
  ];

  const work = [
    { label: "Receipts to verify", value: n("fee_review"), href: "/portal/admin/fees", tone: "var(--viz-1)" },
    { label: "Applications to review", value: m.newQueries ?? 0, href: "/portal/admin/requests", tone: "var(--viz-2)" },
    { label: "Website enquiries", value: m.newEnquiries ?? 0, href: "/portal/admin/enquiries", tone: "var(--viz-3)" },
    { label: "Documents to check", value: m.pendingDocuments ?? 0, href: "/portal/admin/requests", tone: "#9085e9" },
    { label: "Unread messages", value: m.unreadMessages ?? 0, href: "/portal/messages", tone: "#c98500" },
  ];
  const waiting = work.reduce((a, w) => a + w.value, 0);
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Karachi",
  });

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="pv4-hero portal-rise mb-6">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[0.82rem] font-medium text-faint">{today}</p>
            <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-fg-strong sm:text-[2.1rem]">
              {greeting()}, {name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-xl text-[0.93rem] leading-relaxed text-muted">
              {waiting === 0
                ? "Nothing is waiting on the team right now. New receipts and applications appear here the moment they arrive."
                : `${waiting} thing${waiting === 1 ? " is" : "s are"} waiting on the team. Receipts first: a verified fee opens the student's portal.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/portal/admin/fees" className="pv4-btn pv4-btn-primary">
              Verify receipts
              {n("fee_review") > 0 && <span className="pv4-btn-count">{n("fee_review")}</span>}
            </Link>
            <Link href="/portal/admin/requests" className="pv4-btn">
              Review applications
              {(m.newQueries ?? 0) > 0 && <span className="pv4-btn-count">{m.newQueries}</span>}
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- the four figures */}
      <section aria-label="Headline figures" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Students" value={t.students} note="Registered on the portal" series={col("signups")} days={days} color="var(--viz-1)" href="/portal/admin/users?role=students" icon="users" />
        <KpiCard label="Fees verified" value={t.verified} note="Initial fee checked and accepted" series={col("verified")} days={days} color="var(--viz-3)" href="/portal/admin/students" icon="check" />
        <KpiCard label="Receipts to verify" value={n("fee_review")} note={`Receipts sent per day · ${t.awaitingFee} still to pay`} series={col("receipts")} days={days} color="var(--viz-2)" href="/portal/admin/fees" icon="clock" />
        <KpiCard label="Applications submitted" value={t.submitted} note="Sent to us for review" series={col("applications")} days={days} color="#9085e9" href="/portal/admin/requests" icon="send" />
      </section>

      {/* ------------------------------------------- activity + needs attention */}
      <section className="mb-6 grid items-stretch gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Panel title="Activity">
          <DateRangeBar range={range} basePath="/portal/admin" />
          <ActivityChart key={range.fromInput + range.toInput} points={series} bucket={range.bucket} rangeText={range.text} />
        </Panel>
        <Panel title="Needs attention" action={<span className="text-[0.78rem] text-faint">{waiting} waiting</span>}>
          <ul className="space-y-1.5">
            {work.map((w) => (
              <li key={w.label}>
                <Link href={w.href} className={cn("pv4-work", w.value > 0 && "is-on")}>
                  <span className="pv4-work-dot" style={{ background: w.tone }} />
                  <span className="flex-1 text-[0.88rem]">{w.label}</span>
                  <span className="num text-[1.05rem]">{w.value}</span>
                  <svg viewBox="0 0 12 12" fill="none" aria-hidden className="pv4-work-arrow h-3 w-3">
                    <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
          {pendingDocs.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-[0.78rem] font-semibold text-faint">Latest documents</p>
              {pendingDocs.slice(0, 3).map((d) => (
                <DataRow
                  key={d.id}
                  label={d.name}
                  value={<StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />}
                  meta={<span className="text-[0.75rem] text-faint">{d.ownerName}</span>}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* --------------------------------------------- funnel, plans, agents */}
      <section className="mb-6 grid items-stretch gap-5 lg:grid-cols-2 2xl:grid-cols-[1.2fr_1fr_1fr]">
        <Panel title="Student journey">
          <Funnel steps={funnel} />
        </Panel>
        <Panel title="Payment plans">
          <Donut
            centerLabel="students"
            parts={[
              { label: "One-time payment", value: insights.plans.one_time, color: "var(--viz-1)" },
              { label: "Installments", value: insights.plans.installments, color: "var(--viz-2)" },
              { label: "Not chosen yet", value: insights.plans.none, color: "color-mix(in srgb, var(--fg) 22%, transparent)" },
            ]}
          />
        </Panel>
        <div className="lg:col-span-2 2xl:col-span-1">
          <Panel title="Top sales agents" action={<span className="text-[0.78rem] text-faint">{t.agents} on the team</span>}>
            <AgentBoard agents={insights.agents} />
          </Panel>
        </div>
      </section>

      {/* ----------------------------------------------------- newest students */}
      <Panel
        title="Newest students"
        padded={insights.recent.length === 0}
        action={
          <Link href="/portal/admin/users?role=students" className="text-[0.8rem] font-semibold text-accent-ink transition-opacity hover:opacity-80">
            All students
          </Link>
        }
      >
        {insights.recent.length === 0 ? (
          <EmptyState icon="search" title="No students yet" body="Students appear here the moment they register, with their stage, plan and sales agent." />
        ) : (
          <div className="overflow-x-auto">
            <table className="pv4-table w-full min-w-[640px] text-left">
              <caption className="sr-only">Newest students</caption>
              <thead>
                <tr>
                  {["Student", "Stage", "Plan", "Sales agent", "Joined"].map((h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insights.recent.map((r) => {
                  const pill = STAGE_PILL[r.stage] ?? { label: r.stage, tone: "draft" };
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/portal/admin/users/${r.id}`} className="font-medium text-fg hover:text-accent">
                          <Person id={r.id} name={r.name} photo={r.avatar_v != null} v={r.avatar_v} />
                        </Link>
                      </td>
                      <td>
                        <StatusPill status={pill.tone} label={pill.label} />
                      </td>
                      <td className="text-muted">
                        {r.plan === "one_time" ? "One-time" : r.plan === "installments" ? "Installments" : "—"}
                      </td>
                      <td className="text-muted">{r.agent ?? "Direct"}</td>
                      <td className="text-faint">
                        {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

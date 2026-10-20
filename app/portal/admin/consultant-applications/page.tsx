import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { listApplications, type ConsultantApplication } from "@/lib/db/repos/consultant-applications";
import { currentTemplate } from "@/lib/db/repos/consent-templates";
import { PortalHeading, Panel, EmptyState, StatCard, Tabs } from "@/components/portal/Pieces";
import { Avatar } from "@/components/portal/Avatar";
import { DateTag } from "@/components/portal/FeeBits";
import { EscapeTo } from "@/components/portal/EscapeTo";
import { ConsultantAppActions } from "@/components/portal/ConsultantAppActions";

export const metadata: Metadata = { title: "Consultant requests", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * CONSULTANT REQUESTS — people who signed up to become consultants.
 *
 * Review the details and company documents, send the consultant agreement,
 * and approve once it is signed (the account becomes a consultant), or
 * reject with a reason. Super admin only. Adding a consultant by email
 * (Consultants -> Add consultant) still works as before.
 */

const STATUS: Record<string, { label: string; tone: string }> = {
  submitted: { label: "New", tone: "pill-warn" },
  consent_sent: { label: "Agreement sent", tone: "pill-info" },
  consent_signed: { label: "Signed, approve", tone: "pill-work" },
  approved: { label: "Approved", tone: "pill-ok" },
  rejected: { label: "Rejected", tone: "pill-danger" },
};

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: "open", label: "To do", statuses: ["submitted", "consent_sent", "consent_signed"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "all", label: "All", statuses: ["submitted", "consent_sent", "consent_signed", "approved", "rejected"] },
];

export default async function ConsultantApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; view?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const all = await listApplications();
  const consentActive = Boolean(await currentTemplate("consultant", null));
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const rows = all.filter((a) => tab.statuses.includes(a.status));
  const base = tab.key === "open" ? "/portal/admin/consultant-applications" : `/portal/admin/consultant-applications?tab=${tab.key}`;
  const viewHref = (id: string) => `${base}${base.includes("?") ? "&" : "?"}view=${id}`;
  const viewing = sp.view ? all.find((a) => a.userId === sp.view) ?? null : null;
  const count = (s: string) => all.filter((a) => a.status === s).length;

  return (
    <>
      <PortalHeading
        eyebrow="Manage"
        title="Consultant requests"
        lead="People who signed up to work with SnZ Ventures as consultants. Review them, send the consultant agreement, and approve once they have signed it."
      />
      {!consentActive && (
        <p className="note-warn mb-5 p-3 text-[0.85rem] leading-relaxed">
          No SnZ ↔ Consultant agreement is active, so there is nothing for applicants to sign and you can approve them
          directly.{" "}
          <Link href="/portal/admin/forms/consent?tab=consultant" className="font-semibold underline underline-offset-4">
            Publish one
          </Link>{" "}
          to ask for a signature first.
        </p>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="New" value={count("submitted")} urgent={count("submitted") > 0} hint="Waiting for your review" />
        <StatCard label="Signed, to approve" value={count("consent_signed")} urgent={count("consent_signed") > 0} />
        <StatCard label="Approved" value={count("approved")} />
      </div>

      <Tabs
        label="Requests"
        active={tab.key}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: all.filter((a) => t.statuses.includes(a.status)).length,
          href: t.key === "open" ? "/portal/admin/consultant-applications" : `/portal/admin/consultant-applications?tab=${t.key}`,
        }))}
      />

      {viewing && <Drawer app={viewing} closeHref={base} consentActive={consentActive} />}

      <Panel padded={rows.length === 0}>
        {rows.length === 0 ? (
          <EmptyState icon="search" title="Nothing here" body="New requests appear here when somebody signs up as a consultant and submits their application." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <caption className="sr-only">Consultant requests</caption>
              <thead>
                <tr className="border-b border-line">
                  {["#", "Applicant", "Company", "Registered", "Documents", "Applied", "Status", ""].map((h, i) => (
                    <th key={h || i} scope="col" className="label px-4 py-3 text-faint">
                      {h || <span className="sr-only">Open</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => (
                  <tr key={a.userId} className="border-b border-line last:border-0 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
                    <td className="px-4 py-3 font-mono text-[0.8rem] text-faint">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar id={a.userId} name={a.name} photo={a.avatarV != null} v={a.avatarV} size="md" />
                        <span className="min-w-0">
                          <span className="block text-[0.9rem] font-medium text-fg">{a.name}</span>
                          <span className="block text-[0.78rem] text-faint">{a.email}</span>
                          {a.phone && <span className="block text-[0.78rem] text-faint">{a.phone}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.88rem] text-fg">
                      {a.companyName ?? "—"}
                      <span className="block text-[0.76rem] text-faint">{[a.city, a.country].filter(Boolean).join(", ")}</span>
                    </td>
                    <td className="px-4 py-3 text-[0.85rem] text-muted">{a.companyRegistered == null ? "—" : a.companyRegistered ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-[0.85rem] text-muted">{a.documents.length}</td>
                    <td className="px-4 py-3">
                      <DateTag iso={a.submittedAt} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`pill ${STATUS[a.status]?.tone ?? "pill-neutral"}`}>{STATUS[a.status]?.label ?? a.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={viewHref(a.userId)} scroll={false} aria-label={`Open ${a.name}'s request`} data-tip="Review" className="tip tip-end icon-btn">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                          <circle cx="8" cy="8" r="2" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Drawer({ app, closeHref, consentActive }: { app: ConsultantApplication; closeHref: string; consentActive: boolean }) {
  const facts: [string, string | null][] = [
    ["Email", app.email],
    ["Phone", app.phone],
    ["Address", app.address],
    ["City", app.city],
    ["Country", app.country],
    ["Company", app.companyName],
    ["Registered", app.companyRegistered == null ? null : app.companyRegistered ? "Yes" : "No"],
    ["Registration no.", app.registrationNo],
    ["Website", app.website],
  ];
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
  const timeline = [
    ["Applied", when(app.submittedAt)],
    ["Agreement sent", when(app.consentSentAt)],
    ["Agreement signed", when(app.consentSignedAt)],
    [app.status === "rejected" ? "Rejected" : "Approved", app.status === "approved" || app.status === "rejected" ? when(app.decidedAt) : null],
  ].filter((t) => t[1]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-label={`${app.name}'s request`}>
      <EscapeTo href={closeHref} />
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgb(4_8_20/0.6)] backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full max-w-[720px] flex-col border-l border-line bg-[var(--panel-solid)] shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <span className="flex items-center gap-3">
            <Avatar id={app.userId} name={app.name} photo={app.avatarV != null} v={app.avatarV} size="lg" />
            <span>
              <span className="block text-[1.1rem] font-semibold text-fg-strong">{app.name}</span>
              <span className={`pill mt-1 ${STATUS[app.status]?.tone ?? "pill-neutral"}`}>{STATUS[app.status]?.label ?? app.status}</span>
            </span>
          </span>
          <Link href={closeHref} scroll={false} aria-label="Close" data-tip="Close" className="tip tip-end icon-btn">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </Link>
        </header>
        <div className="rail flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-faint">{k}</dt>
                <dd className="mt-0.5 break-words text-[0.9rem] text-fg">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {app.about && (
            <div>
              <h3 className="label text-accent">About their work</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-[0.9rem] leading-relaxed text-muted">{app.about}</p>
            </div>
          )}
          <div>
            <h3 className="label text-accent">Company documents</h3>
            {app.documents.length === 0 ? (
              <p className="mt-1.5 text-[0.88rem] text-muted">None uploaded.</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-[var(--line)]">
                {app.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <a href={`/api/portal/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="truncate text-[0.9rem] text-fg underline-offset-4 hover:text-accent hover:underline">
                      {d.name}
                    </a>
                    <a href={`/api/portal/documents/${d.id}?download=1`} className="text-[0.8rem] text-muted hover:text-fg">
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {timeline.length > 0 && (
            <div>
              <h3 className="label text-accent">Timeline</h3>
              <ul className="mt-1.5 space-y-1 text-[0.88rem] text-muted">
                {timeline.map(([k, v]) => (
                  <li key={k}>
                    <strong className="font-semibold text-fg">{k}</strong> · {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {app.status === "rejected" && app.rejectReason && (
            <p className="note-danger p-3 text-[0.88rem]">Reason sent: {app.rejectReason}</p>
          )}
        </div>
        <footer className="border-t border-line px-6 py-4">
          <ConsultantAppActions userId={app.userId} name={app.name} status={app.status} consentActive={consentActive} />
          {(app.status === "approved" || app.status === "rejected") && (
            <p className="text-[0.85rem] text-faint">This request is decided.</p>
          )}
        </footer>
      </div>
    </div>
  );
}

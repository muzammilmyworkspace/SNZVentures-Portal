import Link from "next/link";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { getIntakeQueue } from "@/lib/db/repos/operations";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Avatar } from "@/components/portal/Avatar";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import { ApplicationReview } from "@/components/portal/ApplicationReview";
import { REVIEW_LABEL } from "@/lib/portal/review-status";
import { BroughtByTag } from "@/components/portal/FeeBits";

/**
 * ONE LIST, THREE STAGES OF THE STUDENT PIPELINE.
 *
 *   review   Review applications   submitted by the student, waiting on us,
 *                                   or sent back to them for changes
 *   ready    Ready to apply        reviewed and approved; apply next
 *   applied  Applied               submitted to the universities
 *
 * Each has its own page and sidebar entry so the pipeline reads in order:
 * enquiry, fee, review, ready, applied. Oldest first everywhere, because the
 * one that has waited longest is the one to pick up next.
 *
 * The eye on each row opens the whole application over the list
 * (`?review=<id>`), with the decision for that stage at its foot.
 */

export type QueueStage = "review" | "ready" | "applied";

const STAGES: Record<
  QueueStage,
  {
    path: string;
    step: string;
    title: string;
    lead: string;
    statuses: string[];
    tabs?: { key: string; label: string; statuses: string[] }[];
    empty: string;
  }
> = {
  review: {
    path: "/portal/admin/requests",
    step: "Step 3 of 5",
    title: "Review applications",
    lead: "Applications students have filled in and sent. Open one with the eye, read it, then move it to Ready to apply or send it back with comments.",
    statuses: ["submitted", "under_review", "returned"],
    tabs: [
      { key: "all", label: "All", statuses: ["submitted", "under_review", "returned"] },
      { key: "review", label: "Under review", statuses: ["submitted", "under_review"] },
      { key: "returned", label: "Changes requested", statuses: ["returned"] },
    ],
    empty: "When a student submits their application, it lands here for review.",
  },
  ready: {
    path: "/portal/admin/ready",
    step: "Step 4 of 5",
    title: "Ready to apply",
    lead: "Reviewed and approved. Apply to the universities, then open the application and mark it as applied.",
    statuses: ["accepted"],
    empty: "Applications you move on from review appear here, ready for the university applications.",
  },
  applied: {
    path: "/portal/admin/applied",
    step: "Step 5 of 5",
    title: "Applied",
    lead: "Applications submitted to the universities. What the universities reply is followed on each case.",
    statuses: ["applied"],
    empty: "Applications you mark as applied appear here.",
  },
};

/** StatusPill colour for each status. */
const TONE: Record<string, string> = {
  submitted: "under_review",
  under_review: "under_review",
  returned: "needs_update",
  accepted: "approved",
  applied: "submitted",
};

const PATHWAY_LABEL: Record<string, string> = {
  study: "Student",
  career: "Job Seeker",
  business: "Business",
};

/** How long a request has been waiting, in plain words. */
function waitingFor(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export async function ApplicationQueue({
  stage,
  params,
}: {
  stage: QueueStage;
  params: { status?: string; pathway?: string; page?: string; review?: string };
}) {
  const cfg = STAGES[stage];
  const all = (await getIntakeQueue(500)).filter((r) => cfg.statuses.includes(r.status));

  const status = cfg.tabs?.some((t) => t.key === params.status) ? params.status! : "all";
  const pathway = params.pathway ?? "all";
  const tabStatuses = cfg.tabs?.find((t) => t.key === status)?.statuses ?? cfg.statuses;
  const rows = all.filter((r) => tabStatuses.includes(r.status) && (pathway === "all" || r.pathway === pathway));
  const pg = paginate(rows, pageFrom(params.page));

  const href = (next: { status?: string; pathway?: string; page?: string | null; review?: string | null }) => {
    const q = new URLSearchParams();
    const s = next.status ?? status;
    const p = next.pathway ?? pathway;
    if (s !== "all") q.set("status", s);
    if (p !== "all") q.set("pathway", p);
    const page = next.page === undefined ? params.page : next.page;
    if (page) q.set("page", page);
    if (next.review) q.set("review", next.review);
    const qs = q.toString();
    return qs ? `${cfg.path}?${qs}` : cfg.path;
  };

  // Waiting only means something while it waits on us.
  const showWaiting = stage === "review" || stage === "ready";

  return (
    <>
      <PortalHeading eyebrow={`Student pipeline · ${cfg.step}`} title={cfg.title} lead={cfg.lead} />
      {params.review && <ApplicationReview intakeId={params.review} closeHref={href({})} />}

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        {cfg.tabs && (
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            {cfg.tabs.map((t) => (
              <Link
                key={t.key}
                href={href({ status: t.key, page: null })}
                aria-current={status === t.key ? "true" : undefined}
                className={
                  status === t.key
                    ? "inline-flex min-h-9 items-center rounded-full bg-moss-400 px-3.5 text-[0.8rem] font-medium text-navy-950"
                    : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.8rem] text-muted transition-colors hover:border-moss-400/60 hover:text-fg"
                }
              >
                {t.label}
                <span className="ml-1.5 opacity-60">{all.filter((r) => t.statuses.includes(r.status)).length}</span>
              </Link>
            ))}
          </nav>
        )}

        <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All types" },
            { key: "study", label: "Student" },
            { key: "career", label: "Job Seeker" },
            { key: "business", label: "Business" },
          ].map((f) => (
            <Link
              key={f.key}
              href={href({ pathway: f.key, page: null })}
              aria-current={pathway === f.key ? "true" : undefined}
              className={
                pathway === f.key
                  ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.8rem] font-medium text-accent"
                  : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.8rem] text-muted transition-colors hover:border-moss-400/60 hover:text-fg"
              }
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      <Panel padded={rows.length === 0}>
        {rows.length === 0 ? (
          <EmptyState
            icon="search"
            title={all.length === 0 ? "Nothing here yet" : "Nothing matches this filter"}
            body={all.length === 0 ? cfg.empty : "Try a different status or type."}
          />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <caption className="sr-only">{cfg.title}</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Client", "Brought by", "Type", "Account", "Submitted", showWaiting ? "Waiting" : "Updated", "Status", ""].map(
                    (h, i) => (
                      <th key={h || i} scope="col" className="label px-5 py-3 text-faint">
                        {h || <span className="sr-only">Open</span>}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
                  >
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar id={r.userId} name={r.userName} photo={r.avatarV != null} v={r.avatarV} size="md" />
                        <span className="min-w-0">
                          <Link
                            href={`/portal/admin/users/${r.userId}`}
                            className="text-[0.9rem] font-medium text-fg underline-offset-4 hover:text-accent hover:underline"
                          >
                            {r.userName}
                          </Link>
                          <span className="mt-0.5 block text-[0.8rem] text-faint">{r.userEmail}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <BroughtByTag name={r.consultantName} />
                    </td>
                    <td className="px-5 py-3">
                      <span className="label text-faint">{PATHWAY_LABEL[r.pathway] ?? r.pathway}</span>
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">
                      {ROLE_LABEL[r.userRole as Role] ?? r.userRole}
                    </td>
                    <td className="px-5 py-3 text-[0.8rem] text-faint">
                      {r.submittedAt
                        ? new Date(r.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">
                      {r.status === "returned"
                        ? "—"
                        : showWaiting
                          ? waitingFor(stage === "ready" ? r.updatedAt : r.submittedAt)
                          : new Date(r.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={TONE[r.status] ?? r.status} label={REVIEW_LABEL[r.status] ?? r.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={href({ review: r.id })}
                        scroll={false}
                        aria-label={`Open ${r.userName}'s application`}
                        data-tip={stage === "review" ? "Review application" : stage === "ready" ? "Open to mark as applied" : "View application"}
                        className="tip tip-end icon-btn"
                      >
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
        <Pager page={pg.page} pages={pg.pages} total={pg.total} basePath={cfg.path} params={params} noun="applications" />
      </Panel>
    </>
  );
}

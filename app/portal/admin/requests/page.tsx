import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { getIntakeQueue } from "@/lib/db/repos/operations";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Avatar } from "@/components/portal/Avatar";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import { ApplicationReview } from "@/components/portal/ApplicationReview";
import { REVIEW_LABEL } from "@/lib/portal/review-status";
import { BroughtByTag } from "@/components/portal/FeeBits";

export const metadata: Metadata = {
  title: "Requests",
  robots: { index: false, follow: false },
};

/**
 * THE REQUESTS WORKSPACE (§17)
 *
 * Submitted intake forms, oldest first — because the oldest unanswered request
 * is always the most urgent one, and a "newest first" list quietly buries it.
 *
 * Filtering is done with links and `searchParams`, not client-side state. It
 * costs one indexed query, survives a page reload, and can be bookmarked or
 * pasted to a colleague, which a `useState` filter cannot.
 */

/*
  THE THREE STAGES OF A SUBMITTED APPLICATION.

    Under review       just submitted (or resubmitted), waiting on us
    Changes requested  sent back to the student with comments
    Ready to apply     reviewed and approved; university applications next

  `submitted` and the older `under_review` are the same stage to everyone.
*/
const STATUS_FILTERS = [
  { key: "all", label: "All", match: () => true },
  { key: "review", label: "Under review", match: (s: string) => s === "submitted" || s === "under_review" },
  { key: "returned", label: "Changes requested", match: (s: string) => s === "returned" },
  { key: "accepted", label: "Ready to apply", match: (s: string) => s === "accepted" },
] as const;

/** StatusPill colour for each stage. */
const TONE: Record<string, string> = {
  submitted: "under_review",
  under_review: "under_review",
  returned: "needs_update",
  accepted: "approved",
};

const PATHWAY_LABEL: Record<string, string> = {
  study: "Student",
  career: "Job Seeker",
  business: "Business",
};

const STATUS_LABEL = REVIEW_LABEL;

/** How long a request has been waiting, in plain words. */
function waitingFor(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pathway?: string; page?: string; review?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Requests" />
        <NotConfigured what="Request management" />
      </>
    );
  }

  const all = await getIntakeQueue(200);

  const status = params.status ?? "all";
  const pathway = params.pathway ?? "all";

  const matcher = STATUS_FILTERS.find((f) => f.key === status)?.match ?? (() => true);
  const rows = all.filter((r) => matcher(r.status) && (pathway === "all" || r.pathway === pathway));
  const pg = paginate(rows, pageFrom(params.page));

  const countFor = (key: string) => {
    const m = STATUS_FILTERS.find((f) => f.key === key)?.match ?? (() => true);
    return all.filter((r) => m(r.status)).length;
  };

  const href = (next: { status?: string; pathway?: string }) => {
    const q = new URLSearchParams();
    const s = next.status ?? status;
    const p = next.pathway ?? pathway;
    if (s !== "all") q.set("status", s);
    if (p !== "all") q.set("pathway", p);
    const qs = q.toString();
    return qs ? `/portal/admin/requests?${qs}` : "/portal/admin/requests";
  };

  /** The list as it is, with the review window opened (or closed) over it. */
  const withReview = (id: string | null) => {
    const q = new URLSearchParams();
    if (status !== "all") q.set("status", status);
    if (pathway !== "all") q.set("pathway", pathway);
    if (params.page) q.set("page", params.page);
    if (id) q.set("review", id);
    const qs = q.toString();
    return qs ? `/portal/admin/requests?${qs}` : "/portal/admin/requests";
  };

  return (
    <>
      <PortalHeading
        eyebrow="Operations"
        title="Requests"
        lead="Every submitted application, oldest first. Open one with the eye to review it, then move it on to Ready to apply or send it back with comments."
      />
      {params.review && <ApplicationReview intakeId={params.review} closeHref={withReview(null)} />}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ status: f.key })}
              aria-current={status === f.key ? "true" : undefined}
              className={
                status === f.key
                  ? "inline-flex min-h-9 items-center rounded-full bg-moss-400 px-3.5 text-[0.8rem] font-medium text-navy-950"
                  : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.8rem] text-muted transition-colors hover:border-moss-400/60 hover:text-fg"
              }
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{countFor(f.key)}</span>
            </Link>
          ))}
        </nav>

        <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All types" },
            { key: "study", label: "Student" },
            { key: "career", label: "Job Seeker" },
            { key: "business", label: "Business" },
          ].map((f) => (
            <Link
              key={f.key}
              href={href({ pathway: f.key })}
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
            title={all.length === 0 ? "No requests yet" : "Nothing matches this filter"}
            body={
              all.length === 0
                ? "When a client submits their application, career profile or business intake, it lands here."
                : "Try a different status or type."
            }
          />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <caption className="sr-only">Submitted requests</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Client", "Brought by", "Type", "Account", "Submitted", "Waiting", "Status", ""].map((h, i) => (
                    <th key={h || i} scope="col" className="label px-5 py-3 text-faint">
                      {h || <span className="sr-only">Review</span>}
                    </th>
                  ))}
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
                    {/*
                      WHOSE STUDENT THIS IS, beside the name rather than one
                      click inside the file. "Direct" is not an absence — it
                      says this person came to SnZ themselves, which is a
                      different thing from a consultant's client and is read
                      differently.
                    */}
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
                        ? new Date(r.submittedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">
                      {/* Only while it waits on us; once decided, the clock is the student's. */}
                      {r.status === "submitted" || r.status === "under_review" ? waitingFor(r.submittedAt) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={TONE[r.status] ?? r.status} label={STATUS_LABEL[r.status] ?? r.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={withReview(r.id)}
                        scroll={false}
                        aria-label={`Review ${r.userName}'s application`}
                        data-tip="Review application"
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
        <Pager page={pg.page} pages={pg.pages} total={pg.total} basePath="/portal/admin/requests" params={params} noun="requests" />
      </Panel>
    </>
  );
}

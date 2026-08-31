import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { getIntakeQueue } from "@/lib/db/repos/operations";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";

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

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "New" },
  { key: "under_review", label: "Under review" },
  { key: "returned", label: "Waiting for user" },
  { key: "accepted", label: "Completed" },
] as const;

const PATHWAY_LABEL: Record<string, string> = {
  study: "Student",
  career: "Job Seeker",
  business: "Business",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "New",
  under_review: "Under review",
  returned: "Waiting for user",
  accepted: "Completed",
  draft: "Draft",
};

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
  searchParams: Promise<{ status?: string; pathway?: string }>;
}) {
  await requireStaff();
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

  const rows = all.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (pathway === "all" || r.pathway === pathway)
  );

  const countFor = (key: string) =>
    key === "all" ? all.length : all.filter((r) => r.status === key).length;

  const href = (next: { status?: string; pathway?: string }) => {
    const q = new URLSearchParams();
    const s = next.status ?? status;
    const p = next.pathway ?? pathway;
    if (s !== "all") q.set("status", s);
    if (p !== "all") q.set("pathway", p);
    const qs = q.toString();
    return qs ? `/portal/admin/requests?${qs}` : "/portal/admin/requests";
  };

  return (
    <>
      <PortalHeading
        eyebrow="Operations"
        title="Requests"
        lead="Every submitted intake, oldest first. The one at the top has been waiting longest."
      />

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
            <table className="w-full min-w-[860px] text-left">
              <caption className="sr-only">Submitted requests</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Client", "Type", "Account", "Submitted", "Waiting", "Status"].map((h) => (
                    <th key={h} scope="col" className="label px-5 py-3 text-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/portal/admin/users/${r.userId}`}
                        className="text-[0.9rem] font-medium text-fg underline-offset-4 hover:text-accent hover:underline"
                      >
                        {r.userName}
                      </Link>
                      <span className="mt-0.5 block text-[0.8rem] text-faint">{r.userEmail}</span>
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
                      {waitingFor(r.submittedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
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

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/client";
import { deskStudents, mustOnboard, type DeskStudent } from "@/lib/db/repos/student-desk";
import { PortalHeading, Panel, EmptyState, StatCard, StatusPill, Tabs } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Avatar } from "@/components/portal/Avatar";
import { ApplicationReview } from "@/components/portal/ApplicationReview";
import { DocumentsDrawer } from "@/components/portal/DocumentsDrawer";
import { StageSelect } from "@/components/portal/StageSelect";
import { NewMessageButton } from "@/components/portal/NewMessage";
import { memberId } from "@/lib/portal/member-id";

export const metadata: Metadata = { title: "Students", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * STUDENTS — the student desk.
 *
 * Every student whose fee is verified, from there to the finished
 * application: their ID, where the application stands, their documents. The
 * eye opens the whole application with the decision at its foot; the folder
 * opens their documents to approve or ask again; the bubble writes to them.
 *
 * Not shown, on purpose: the consultant who brought them and where they came
 * from. Super admins and admins with the Students area see the same page.
 */

const TABS: { key: string; label: string; match: (s: DeskStudent) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "filling", label: "Filling in", match: (s) => s.status === null || s.status === "draft" },
  { key: "review", label: "Under review", match: (s) => s.status === "submitted" || s.status === "under_review" },
  { key: "returned", label: "Changes requested", match: (s) => s.status === "returned" },
  { key: "ready", label: "Ready to apply", match: (s) => s.status === "accepted" },
  { key: "applied", label: "Applied", match: (s) => s.status === "applied" },
  { key: "completed", label: "Completed", match: (s) => s.status === "completed" },
];

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; user?: string; page?: string; review?: string; docs?: string; preview?: string }>;
}) {
  const { session } = await requireArea("students");
  // First sign-in: photo, details and their own password come first.
  if (!session.impersonator && (await mustOnboard(session.userId))) redirect("/welcome");
  const params = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Students" title="Students" />
        <NotConfigured what="Students" />
      </>
    );
  }

  const all = await deskStudents();
  const tab = TABS.find((t) => t.key === params.tab) ?? TABS[0];
  const q = (params.q ?? "").trim().toLowerCase();
  const rows = all.filter(
    (s) =>
      tab.match(s) &&
      (!params.user || s.userId === params.user) &&
      (!q ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        memberId("student", s.memberNo).toLowerCase().includes(q))
  );
  const pg = paginate(rows, pageFrom(params.page));

  const href = (next: { tab?: string; page?: string | null; review?: string | null; docs?: string | null }) => {
    const u = new URLSearchParams();
    const t = next.tab ?? tab.key;
    if (t !== "all") u.set("tab", t);
    if (params.q) u.set("q", params.q);
    if (params.user) u.set("user", params.user);
    const page = next.page === undefined ? params.page : next.page;
    if (page) u.set("page", page);
    if (next.review) u.set("review", next.review);
    if (next.docs) u.set("docs", next.docs);
    const s = u.toString();
    return s ? `/portal/admin/students?${s}` : "/portal/admin/students";
  };

  const count = (key: string) => all.filter(TABS.find((t) => t.key === key)!.match).length;
  const docsWaiting = all.reduce((n, s) => n + s.docsWaiting, 0);

  return (
    <>
      <PortalHeading
        eyebrow="Student desk"
        title="Students"
        lead="Every student whose fee is verified, through to the finished application. Open an application with the eye, their documents with the folder."
      />
      {params.review && <ApplicationReview intakeId={params.review} closeHref={href({})} limited />}
      {params.docs && (
        <DocumentsDrawer
          userId={params.docs}
          previewId={params.preview ?? null}
          baseHref={{ open: href({ docs: params.docs }), close: href({}) }}
        />
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={all.length} />
        <StatCard label="Filling in" value={count("filling")} href={href({ tab: "filling", page: null })} />
        <StatCard label="Waiting for review" value={count("review")} href={href({ tab: "review", page: null })} urgent={count("review") > 0} />
        <StatCard label="Documents to check" value={docsWaiting} hint="Uploaded, not yet approved" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form action="/portal/admin/students" className="flex w-full max-w-md items-center gap-2">
          {tab.key !== "all" && <input type="hidden" name="tab" value={tab.key} />}
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name, email or STU- ID"
            aria-label="Search students"
            className="field h-10 py-1"
          />
          <button type="submit" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.85rem] text-fg hover:border-[var(--accent)] hover:text-accent">
            Search
          </button>
        </form>
        {(params.q || params.user) && (
          <Link href={href({ page: null }).replace(/[?&](q|user)=[^&]*/g, "").replace("students&", "students?")} className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-fg">
            Clear search
          </Link>
        )}
      </div>

      <Tabs
        label="Application stage"
        active={tab.key}
        items={TABS.map((t) => ({ key: t.key, label: t.label, count: count(t.key), href: href({ tab: t.key, page: null }) }))}
      />

      <Panel padded={rows.length === 0}>
        {rows.length === 0 ? (
          <EmptyState
            icon="search"
            title={all.length === 0 ? "No students yet" : "Nobody matches"}
            body={all.length === 0 ? "Students appear here once their fee is verified." : "Try another stage or search."}
          />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <caption className="sr-only">Students</caption>
              <thead>
                <tr className="border-b border-line">
                  {["#", "ID", "Student", "Phone", "Fee verified", "Application", "Documents", ""].map((h, i) => (
                    <th key={h || i} scope="col" className="label px-4 py-3 text-faint">
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((s, i) => (
                  <tr key={s.userId} className="border-b border-line transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
                    <td className="px-4 py-3 font-mono text-[0.8rem] text-faint">{(pg.page - 1) * pg.size + i + 1}</td>
                    <td className="px-4 py-3">
                      <span data-group="student" className="group-id whitespace-nowrap font-mono text-[0.75rem] font-semibold">
                        {memberId("student", s.memberNo)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar id={s.userId} name={s.name} photo={s.avatarV != null} v={s.avatarV} size="md" />
                        <span className="min-w-0">
                          <span className="block text-[0.9rem] font-medium text-fg">{s.name}</span>
                          <span className="block text-[0.78rem] text-faint">{s.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.84rem] text-muted">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-[0.82rem] text-faint">{day(s.feeVerifiedAt)}</td>
                    <td className="px-4 py-3">
                      {s.intakeId && s.status && s.status !== "draft" ? (
                        <StageSelect intakeId={s.intakeId} status={s.status} studentName={s.name} />
                      ) : (
                        <StatusPill status="draft" label={s.status === "draft" ? "Filling in" : "Not started"} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-[0.84rem]">
                      <span className="text-fg">{s.docs}</span>
                      <span className="text-faint"> uploaded</span>
                      {s.docsWaiting > 0 && <span className="ml-1.5 text-warn">· {s.docsWaiting} to check</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <NewMessageButton
                          preset={{ id: s.userId, name: s.name, email: s.email, role: "student", memberNo: s.memberNo, avatarV: s.avatarV }}
                          studentsOnly
                        />
                        <Link href={href({ docs: s.userId })} scroll={false} aria-label={`${s.name}'s documents`} data-tip="Documents" className="tip icon-btn">
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
                            <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
                          </svg>
                        </Link>
                        {s.intakeId ? (
                          <Link href={href({ review: s.intakeId })} scroll={false} aria-label={`Open ${s.name}'s application`} data-tip="Application" className="tip tip-end icon-btn">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                              <circle cx="8" cy="8" r="2" />
                            </svg>
                          </Link>
                        ) : (
                          <span data-tip="No application yet" className="tip tip-end icon-btn opacity-40">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                              <circle cx="8" cy="8" r="2" />
                            </svg>
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={pg.page} pages={pg.pages} total={pg.total} basePath="/portal/admin/students" params={params} noun="students" />
      </Panel>
    </>
  );
}

import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getAssignedClients, getCasesForAdvisor, getAdvisorBoard } from "@/lib/db/repos/portal";
import { listInvites } from "@/lib/db/repos/invites";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import {
  PortalHeading,
  Panel,
  EmptyState,
  StatCard,
  DataTable,
  Row,
  Cell,
  StatusPill,
} from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { InviteStudent } from "@/components/portal/InviteStudent";
import { InviteList } from "@/components/portal/InviteList";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Avatar } from "@/components/portal/Avatar";
import { HistoryDrawer } from "@/components/portal/HistoryDrawer";
import { codeContext } from "@/lib/db/repos/invites";
import { REVIEW_LABEL } from "@/lib/portal/review-status";
import { STAGE_BY_KEY } from "@/lib/portal/advisor-stages";

export const dynamic = "force-dynamic";

/** Where a student is, in one word: the application stage once there is one. */
const STAGE_TONE: Record<string, string> = {
  submitted: "under_review",
  under_review: "under_review",
  returned: "needs_update",
  accepted: "approved",
  applied: "submitted",
  completed: "completed",
  fee_due: "pending",
  fee_rejected: "needs_update",
  fee_review: "under_review",
  application: "new",
  consent_due: "pending",
  complete: "approved",
};

/**
 * YOUR STUDENTS — the people assigned to you.
 *
 * `requireStaff`, not `requireAdmin`: this is the one operational screen a
 * consultant owns outright, and every query on it is scoped to the viewer in
 * SQL, so an admin opening it sees only their own book.
 *
 * Enrolling is a consultant's job, so the enrolment tools (the code, the link
 * maker and the list of links) are shown to consultants only. An admin
 * places students by assigning them from Users.
 *
 * The clock on each row opens the student's full history: every action on
 * their file, by whom and when (see HistoryDrawer).
 */
export default async function MyStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { session, role } = await requireStaff();
  const admin = isAdmin(role);

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Your students" title="Students" />
        <NotConfigured what="Student enrolment" />
      </>
    );
  }

  // Sequential, not Promise.all: one connection, and concurrent reads starve.
  const clients = await getAssignedClients(session.userId);
  const cases = await getCasesForAdvisor(session.userId);
  const board = await getAdvisorBoard(session.userId);
  const invites = admin ? [] : await listInvites(session.userId);
  const { ownCode } = admin ? { ownCode: null } : await codeContext(session.userId);
  const stageOf = new Map(board.map((b) => [b.id, b.stage]));

  const pg = paginate(clients, pageFrom(sp.page));
  const historyId = typeof sp.history === "string" && clients.some((c) => c.id === sp.history) ? sp.history : null;
  const href = (history: string | null) => {
    const q = new URLSearchParams();
    if (typeof sp.page === "string") q.set("page", sp.page);
    if (history) q.set("history", history);
    const qs = q.toString();
    return qs ? `/portal/admin/my-students?${qs}` : "/portal/admin/my-students";
  };

  const openCases = cases.filter((c) => !["completed", "closed"].includes(c.status)).length;
  const needsAttention = cases.filter((c) =>
    ["action_required", "documents_required", "awaiting_client", "needs_update"].includes(c.status)
  ).length;
  const waitingLinks = invites.filter((i) => i.status === "pending").length;

  return (
    <>
      <PortalHeading
        eyebrow="Your students"
        title="Students"
        lead={
          admin
            ? "Students assigned to you. Open the clock on any row for their full history."
            : "Everyone you have enrolled. Open the clock on any row for their full history."
        }
      />
      {historyId && <HistoryDrawer userId={historyId} closeHref={href(null)} />}

      <div className={`grid gap-4 sm:grid-cols-2 ${admin ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        <StatCard label="Students" value={clients.length} />
        <StatCard label="Open cases" value={openCases} />
        <StatCard label="Need attention" value={needsAttention} urgent={needsAttention > 0} hint="Waiting on the student" />
        {!admin && <StatCard label="Links waiting" value={waitingLinks} hint="Sent, not used yet" />}
      </div>

      <div className="mt-5 grid items-start gap-5">
        {!admin && ownCode && (
          <Panel title="Your consultant code">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="font-mono text-[1.5rem] font-semibold tracking-wider text-accent">{ownCode}</span>
              <span className="max-w-xl text-[0.88rem] leading-relaxed text-muted">
                Students who enter this code when they sign up, or later in their Settings, become your
                students automatically. Share it on WhatsApp, a flyer or by phone.
              </span>
            </div>
          </Panel>
        )}
        {!admin && (
          <Panel title="Enrol a student">
            <p className="mb-4 text-[0.88rem] leading-relaxed text-muted">
              Or send one student a personal link. When they use it, their account is created and they
              become yours. The code above does the same for anyone you give it to.
            </p>
            <InviteStudent />
          </Panel>
        )}

        <Panel title="Your students" padded={clients.length === 0}>
          {clients.length === 0 ? (
            <EmptyState
              icon="search"
              title="No students yet"
              body={
                admin
                  ? "Students you assign to yourself from Users appear here."
                  : "Give a student your code, or send them a link above."
              }
            />
          ) : (
            <DataTable columns={["#", "Student", "Type", "Stage", "Joined", "Account", ""]} caption="Your students" minWidth={880}>
              {pg.rows.map((c, i) => {
                const app = c.applicationStatus && c.applicationStatus !== "draft" ? c.applicationStatus : null;
                const boardStage = stageOf.get(c.id);
                const stageKey = app ?? boardStage ?? null;
                const stageLabel = app
                  ? REVIEW_LABEL[app] ?? app
                  : boardStage && boardStage !== "other"
                    ? STAGE_BY_KEY[boardStage]?.label ?? boardStage
                    : "—";
                return (
                  <Row key={c.id}>
                    <Cell muted>
                      <span className="num">{(pg.page - 1) * pg.size + i + 1}</span>
                    </Cell>
                    <Cell>
                      <span className="flex items-center gap-3">
                        <Avatar id={c.id} name={c.name} photo={c.avatarV != null} v={c.avatarV} size="md" />
                        <span className="min-w-0">
                          <Link
                            href={`/portal/admin/users/${c.id}`}
                            className="block truncate text-fg underline-offset-4 hover:text-accent hover:underline"
                          >
                            {c.name}
                          </Link>
                          <span className="block truncate text-[0.8rem] text-faint">{c.email}</span>
                        </span>
                      </span>
                    </Cell>
                    <Cell muted>{ROLE_LABEL[c.role as Role]}</Cell>
                    <Cell>
                      {stageLabel === "—" ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <StatusPill status={STAGE_TONE[stageKey ?? ""] ?? "new"} label={stageLabel} />
                      )}
                    </Cell>
                    <Cell muted>
                      {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </Cell>
                    <Cell>
                      <StatusPill status={c.status} label={c.status === "active" ? "Active" : "Suspended"} />
                    </Cell>
                    <Cell>
                      <span className="flex items-center justify-end gap-2">
                        <Link
                          href={href(c.id)}
                          scroll={false}
                          aria-label={`${c.name}'s history`}
                          data-tip="History"
                          className="tip icon-btn"
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="8" cy="8" r="6" />
                            <path d="M8 4.5V8l2.5 1.5" />
                          </svg>
                        </Link>
                        <Link
                          href={`/portal/admin/users/${c.id}`}
                          aria-label={`Open ${c.name}'s file`}
                          data-tip="Open file"
                          className="tip tip-end icon-btn"
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                            <circle cx="8" cy="8" r="2" />
                          </svg>
                        </Link>
                      </span>
                    </Cell>
                  </Row>
                );
              })}
            </DataTable>
          )}
          <Pager inset={clients.length === 0} page={pg.page} pages={pg.pages} total={pg.total} basePath="/portal/admin/my-students" params={sp} noun="students" />
        </Panel>

        {!admin && (
          <Panel title="Enrolment links">
            {invites.length === 0 ? (
              <EmptyState
                icon="search"
                title="No links yet"
                body="Links you create appear here, including the ones that have already been used."
              />
            ) : (
              <InviteList invites={invites} />
            )}
          </Panel>
        )}
      </div>
    </>
  );
}

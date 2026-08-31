import Link from "next/link";
import { requireStaff } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/guard";
import {
  getAdminOverview,
  getCasesForAdvisor,
  getAssignedClients,
} from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import {
  PortalHeading,
  Panel,
  EmptyState,
  WorkCard,
  AllClear,
  Breakdown,
  StatusPill,
  DataRow,
} from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";

/**
 * STAFF OVERVIEW
 *
 * Two views from one route:
 *   • advisor      → only clients and cases assigned to them
 *   • admin/super  → everything
 *
 * The scoping is done in SQL (see lib/db/repos/portal.ts), not by filtering in
 * this component, so an authorization mistake here still cannot leak rows.
 * Every figure is a real COUNT — nothing is seeded or estimated.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS PAGE IS ORGANISED, and why it changed
 *
 * It used to open with eight figures in one row — total users, students,
 * professionals, businesses, open cases, docs to review, appointments, unread
 * — all the same size, five of them zero. Two completely different kinds of
 * fact were sitting side by side at equal weight: JOBS WAITING FOR A PERSON,
 * and FACTS ABOUT THE BUSINESS. You could not tell them apart without reading
 * every one and deciding for yourself, which is a report, not a dashboard.
 *
 * Now the page answers two questions in order:
 *
 *   1. What is waiting on me?   → work cards, quiet at zero, or one "all
 *                                 clear" line when there is genuinely nothing
 *   2. What does the portal
 *      look like right now?     → the make-up of the people in it, and the
 *                                 real queues underneath
 *
 * The row of shortcut links that used to sit at the bottom is gone. It
 * repeated five destinations the sidebar already carries, on every load,
 * costing a card's worth of space to say nothing new.
 */
export default async function AdminPage() {
  const { session, role } = await requireStaff();
  const admin = isAdmin(role);

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading
          eyebrow="Staff"
          title={admin ? "Administrator overview" : "Advisor overview"}
        />
        <NotConfigured what="Staff tooling" />
      </>
    );
  }

  /*
    ONE query for the admin view, not five.

    Five independent reads through Promise.all opened five connections at once,
    and Supabase's transaction pooler starves rather than refuses: it completes
    the handshake before it has a backend, so the connection looks established
    and the query never starts. `connect_timeout` is already satisfied by then
    and `statement_timeout` has not begun, so nothing fires and the request
    hangs until the platform kills it. Every other admin page issues two reads
    and was fine; this one timed out at thirty seconds, every time, with a
    platform timeout in the logs and no database error to explain it.

    `getAdminOverview` returns the counts, the recent cases, the review queue
    and the newest users as JSON from a single statement — one connection, one
    round trip, ~200ms. The advisor view still uses its own scoped queries,
    which are two, not five.
  */
  const overview = admin ? await getAdminOverview(12, 10, 8) : null;

  const [advisorCases, myClients] = admin
    ? [[], []]
    : await Promise.all([
        getCasesForAdvisor(session.userId),
        getAssignedClients(session.userId),
      ]);

  const m = (overview?.metrics ?? {}) as Record<string, number>;
  const cases = admin ? (overview?.cases ?? []) : advisorCases;
  const pendingDocs = overview?.pendingDocuments ?? [];
  const recentUsers = overview?.recentUsers ?? [];

  /*
    THE WORK, in the order a person would actually pick it up.

    An unanswered enquiry is someone waiting on a first reply, which is the
    only item here where the delay is felt by a stranger deciding whether this
    firm is responsive. A held-up document blocks a case that is already
    underway. A message is a conversation in progress. A consultation is
    already scheduled, so it is the least urgent of the four.

    `newQueries` was in the query all along and never shown, which meant the
    most time-sensitive thing on the page was the one thing invisible on it.
  */
  const work = [
    /*
      Contact-form enquiries come FIRST because they are from people with no
      account and no relationship yet — the only ones who will simply go
      elsewhere if nobody replies.
    */
    {
      label: "Contact enquiries",
      value: m.newEnquiries ?? 0,
      note: "From the public site, nobody has picked these up yet.",
      href: "/portal/admin/enquiries",
    },
    {
      label: "Submitted applications",
      value: m.newQueries ?? 0,
      note: "Completed forms waiting for a first reply.",
      href: "/portal/admin/requests",
    },
    {
      label: "Documents to review",
      value: m.pendingDocuments ?? 0,
      note: "Uploaded by clients, waiting on your approval.",
      href: "/portal/admin/documents",
    },
    {
      label: "Unread messages",
      value: m.unreadMessages ?? 0,
      note: "Nobody on the team has opened these yet.",
      href: "/portal/messages",
    },
    {
      label: "Consultations",
      value: m.appointments ?? 0,
      note: "Requested or confirmed, still to be held.",
      href: "/portal/appointments",
    },
  ];

  const advisorWork = [
    {
      label: "My cases",
      value: cases.length,
      note: "Cases you are responsible for.",
      href: "/portal/admin/cases",
    },
    {
      label: "My clients",
      value: myClients.length,
      note: "People assigned to you by an administrator.",
      href: "/portal/admin/users",
    },
  ];

  const shown = admin ? work : advisorWork;
  const nothingWaiting = shown.every((w) => w.value === 0);

  /*
    Five cards for an admin, so 3+2 on a laptop and five across on a wide
    screen. A four-column grid left the fifth alone on its own row.

    Held in a variable rather than written inline because the div sits in a
    ternary branch, where a JSX comment beside it counts as a second expression
    and will not parse.
  */
  const workGrid = `grid gap-4 sm:grid-cols-2 ${admin ? "lg:grid-cols-3 xl:grid-cols-5" : ""}`;

  const people = [
    { label: "Students", value: m.students ?? 0 },
    { label: "Job seekers", value: m.professionals ?? 0 },
    { label: "Businesses", value: m.businesses ?? 0 },
    { label: "Team", value: m.advisors ?? 0 },
  ];

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title={admin ? "Administrator overview" : "Advisor overview"}
        lead={
          admin
            ? "What's waiting on the team right now, and how the portal stands today."
            : "Your assigned clients and the cases you are responsible for."
        }
      />

      {/* ------------------------------------------------ what needs a person */}
      <section className="mb-5">
        <h2 className="label mb-3.5 text-faint">Needs attention</h2>
        {nothingWaiting ? (
          <AllClear
            title="Nothing is waiting on you."
            body={
              admin
                ? "No unanswered enquiries, no documents held up, no unread messages. New work appears here the moment it arrives."
                : "No cases or clients assigned to you yet. An administrator assigns them, and they appear here."
            }
            action={admin ? { label: "Open cases", href: "/portal/admin/cases" } : undefined}
          />
        ) : (
          <div className={workGrid}>
            {shown.map((w) => (
              <WorkCard key={w.label} {...w} />
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------- the live queues */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title={admin ? "Recent cases" : "My cases"}
          action={
            <Link href="/portal/admin/cases" className="label text-faint transition-colors hover:text-accent">
              View all
            </Link>
          }
        >
          {cases.length === 0 ? (
            <EmptyState
              icon="file"
              title="No cases yet"
              body={
                admin
                  ? "A case is opened for a client once you take their enquiry forward. They appear here as they are created."
                  : "Cases assigned to you appear here."
              }
            />
          ) : (
            <div className="rail overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <caption className="sr-only">Cases</caption>
                <thead>
                  <tr className="border-b border-line">
                    {["Client", "Case", "Status", "Updated"].map((h) => (
                      <th key={h} scope="col" className="label pb-3 pr-4 text-faint">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/portal/admin/cases/${c.id}`}
                          className="text-[0.9rem] text-fg hover:text-accent"
                        >
                          {c.clientName}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[0.85rem] text-muted">{c.title}</td>
                      <td className="py-3 pr-4">
                        <StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />
                      </td>
                      <td className="py-3 text-[0.85rem] text-faint">
                        {new Date(c.updatedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title={admin ? "Documents awaiting review" : "My clients"}
          action={
            admin ? (
              <Link href="/portal/admin/documents" className="label text-faint transition-colors hover:text-accent">
                Review
              </Link>
            ) : undefined
          }
        >
          {admin ? (
            pendingDocs.length === 0 ? (
              <EmptyState
                icon="check"
                title="Nothing awaiting review"
                body="When a client uploads a passport, transcript or bank letter, it queues here for approval."
              />
            ) : (
              pendingDocs.map((d) => (
                <DataRow
                  key={d.id}
                  label={d.name}
                  value={<StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />}
                  meta={<span className="label text-faint">{d.ownerName}</span>}
                />
              ))
            )
          ) : myClients.length === 0 ? (
            <EmptyState
              icon="search"
              title="No clients assigned"
              body="An administrator assigns clients to you. They will appear here."
            />
          ) : (
            myClients.map((c) => (
              <DataRow key={c.id} label={c.name} value={ROLE_LABEL[c.role as Role]} />
            ))
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------------ who is here */}
      {admin && (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_1.5fr]">
          <Panel
            title="Who's in the portal"
            action={
              <Link href="/portal/admin/users" className="label text-faint transition-colors hover:text-accent">
                Manage
              </Link>
            }
          >
            <Breakdown parts={people} total={m.totalUsers ?? 0} totalLabel="people with an account" />
            <p className="mt-5 border-t border-line pt-4 text-[0.8rem] leading-relaxed text-faint">
              {(m.openCases ?? 0) === 0 && (m.completedCases ?? 0) === 0
                ? "No cases have been opened yet."
                : `${m.openCases ?? 0} case${(m.openCases ?? 0) === 1 ? "" : "s"} open, ${m.completedCases ?? 0} completed.`}
            </p>
          </Panel>

          <Panel
            title="Recent registrations"
            action={
              <Link href="/portal/admin/users" className="label text-faint transition-colors hover:text-accent">
                Manage users
              </Link>
            }
          >
            {recentUsers.length === 0 ? (
              <EmptyState
                icon="search"
                title="No accounts yet"
                body="Anyone who signs up appears here, newest first, with the pathway they chose."
              />
            ) : (
              recentUsers.map((u) => (
                <DataRow
                  key={u.id}
                  label={u.name}
                  value={
                    <StatusPill
                      status={u.status === "active" ? "approved" : "needs_update"}
                      label={u.status}
                    />
                  }
                  meta={<span className="label text-faint">{ROLE_LABEL[u.role]}</span>}
                />
              ))
            )}
          </Panel>
        </div>
      )}
    </>
  );
}

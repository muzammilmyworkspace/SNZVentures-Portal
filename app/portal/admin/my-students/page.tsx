import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getAssignedClients, getCasesForAdvisor } from "@/lib/db/repos/portal";
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

export const dynamic = "force-dynamic";

/**
 * A CONSULTANT'S OWN BOOK.
 *
 * `requireStaff`, not `requireAdmin`: this is the one operational screen a
 * consultant (stored role `advisor`) owns outright. Everything on it is
 * already scoped to them by the queries themselves — `getAssignedClients` and
 * `getCasesForAdvisor` both join staff_assignments — so an admin opening it
 * sees their own book, not everybody's. The firm-wide views are Cases and
 * Users, which stay admin-only.
 *
 * There is deliberately no consultant picker here. An admin who needs to look
 * at somebody else's book uses Advisors, which is built for exactly that.
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

  const [clients, cases, invites] = await Promise.all([
    getAssignedClients(session.userId),
    getCasesForAdvisor(session.userId),
    listInvites(session.userId),
  ]);
  const pg = paginate(clients, pageFrom(sp.page));

  const openCases = cases.filter((c) => !["completed", "closed"].includes(c.status)).length;
  const needsAttention = cases.filter((c) =>
    ["action_required", "documents_required", "awaiting_client", "needs_update"].includes(c.status)
  ).length;
  const waitingLinks = invites.filter((i) => i.status === "pending").length;

  return (
    <>
      {/*
        THE SCOPE, SAID OUT LOUD.

        An admin's Cases page is firm-wide and this page is not, so the two
        counts differ by design and it looked like data going missing. A page
        that shows a subset has to say which subset, and where the whole is.
      */}
      <PortalHeading
        eyebrow="Your students"
        title="Students"
        lead={
          admin
            ? "Students assigned to you, and the links you have sent. Cases and Users are firm-wide; this page is only your own book."
            : "Everyone you have enrolled, and the links you have sent. You only ever see your own."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={clients.length} />
        {/*
          One student can hold more than one case, so these two numbers are
          not meant to match — the hint says so, because when they did not
          match it read as a student having gone missing.
        */}
        <StatCard
          label="Open cases"
          value={openCases}
          hint={
            clients.length === cases.length
              ? undefined
              : `${cases.length} in total across ${clients.length} student${
                  clients.length === 1 ? "" : "s"
                }`
          }
        />
        <StatCard
          label="Need attention"
          value={needsAttention}
          urgent={needsAttention > 0}
          hint="Waiting on the student"
        />
        <StatCard label="Links waiting" value={waitingLinks} hint="Sent, not used yet" />
      </div>

      <div className="mt-5 grid items-start gap-5">
        <Panel title="Enrol a student">
          <p className="mb-4 text-[0.88rem] leading-relaxed text-muted">
            Create a link and send it to one student. When they use it, their account is created
            and they become yours — no one has to assign them by hand.
          </p>
          <InviteStudent />
        </Panel>

        <Panel title="Your students">
          {clients.length === 0 ? (
            <EmptyState
              icon="search"
              title="No students yet"
              body="Create an enrolment link above and send it to your first student."
            />
          ) : (
            <DataTable
              columns={["Name", "Email", "Type", "Cases", "Status"]}
              caption="Students assigned to you"
            >
              {pg.rows.map((c) => (
                <Row key={c.id}>
                  {/*
                    The name opens the file. It always did on Users and never
                    here, so the one screen a consultant lives on was the one
                    with no way into a student's record.
                  */}
                  <Cell>
                    <Link
                      href={`/portal/admin/users/${c.id}`}
                      className="text-fg underline-offset-4 hover:text-accent hover:underline"
                    >
                      {c.name}
                    </Link>
                  </Cell>
                  <Cell muted>{c.email}</Cell>
                  <Cell muted>{ROLE_LABEL[c.role as Role]}</Cell>
                  {/*
                    WHY THE TWO NUMBERS DIFFER, on the row that explains it.
                    Without this a student count of 2 beside a case count of 3
                    is unaccountable, and the only reading is that something is
                    missing.
                  */}
                  <Cell muted>
                    {c.caseCount === 0 ? (
                      "None yet"
                    ) : (
                      <>
                        {c.caseCount} case{c.caseCount === 1 ? "" : "s"}
                        {c.openCases > 0 && ` · ${c.openCases} open`}
                      </>
                    )}
                  </Cell>
                  <Cell>
                    <StatusPill status={c.status} label={c.status === "active" ? "Active" : "Suspended"} />
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
          <Pager inset page={pg.page} pages={pg.pages} total={pg.total} basePath="/portal/admin/my-students" params={sp} noun="students" />
        </Panel>

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
      </div>

      <p className="mt-5 text-[0.82rem] leading-relaxed text-faint">
        A student who signed up on their own does not appear here until an administrator assigns
        them. Send them a link instead — an existing account can use it too.{" "}
        <Link href="/portal/messages" className="underline underline-offset-4 hover:text-fg">
          Message us
        </Link>{" "}
        if one of yours is missing.
      </p>
    </>
  );
}

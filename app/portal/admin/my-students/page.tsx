import Link from "next/link";
import { requireStaff } from "@/lib/auth/guard";
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
export default async function MyStudentsPage() {
  const { session } = await requireStaff();

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
        lead="Everyone you have enrolled, and the links you have sent. You only ever see your own."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={clients.length} />
        <StatCard label="Open cases" value={openCases} />
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
            <DataTable columns={["Name", "Email", "Type", "Status"]} caption="Students assigned to you">
              {clients.map((c) => (
                <Row key={c.id}>
                  <Cell>{c.name}</Cell>
                  <Cell muted>{c.email}</Cell>
                  <Cell muted>{ROLE_LABEL[c.role as Role]}</Cell>
                  <Cell>
                    <StatusPill status={c.status} label={c.status === "active" ? "Active" : "Suspended"} />
                  </Cell>
                </Row>
              ))}
            </DataTable>
          )}
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

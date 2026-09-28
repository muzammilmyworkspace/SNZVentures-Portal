import { requireAdmin } from "@/lib/auth/guard";
import { getAdvisorsWithLoad, getClientsByAdvisor } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { mailConfigured } from "@/lib/mail";
import { PortalHeading, Panel, EmptyState, StatCard } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { AddConsultant } from "@/components/portal/AddConsultant";
import { ConsultantList } from "@/components/portal/ConsultantList";

export const dynamic = "force-dynamic";

/**
 * CONSULTANTS — who they are, what they are carrying, and a way into either.
 *
 * `requireAdmin` to read: an admin needs to see the book even where they
 * cannot change it. Creating an account and stepping into one are narrower,
 * and are gated separately on the server in their own routes.
 */
export default async function ConsultantsPage() {
  const { session } = await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="People" title="Consultants" />
        <NotConfigured what="Consultant management" />
      </>
    );
  }

  const isSuperAdmin = session.role === "super_admin";

  /*
    Two queries for the whole page, whatever the number of consultants — the
    N+1 the previous version of this page was written to avoid, kept avoided.

    The students are loaded up front rather than when a panel opens: six
    consultants with eight students each is a few dozen rows, which is smaller
    than the loading state that fetching-on-click would need.
  */
  const [consultants, clients] = await Promise.all([
    getAdvisorsWithLoad(),
    getClientsByAdvisor(),
  ]);

  /*
    Admins and super admins can hold assigned clients too, so they appear in
    the table — hiding them would make a student look unassigned when they are
    not. They are not counted as consultants, because they are not.
  */
  const actual = consultants.filter((c) => c.role === "advisor");
  const students = consultants.reduce((n, c) => n + c.clientCount, 0);
  const waiting = consultants.reduce((n, c) => n + c.needsAttention, 0);

  return (
    <>
      <PortalHeading
        eyebrow="People"
        title="Consultants"
        lead="Who enrols students, what each one is carrying, and how to look at their side of the portal."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Consultants" value={actual.length} />
        <StatCard label="Students enrolled" value={students} />
        <StatCard
          label="Waiting on the student"
          value={waiting}
          urgent={waiting > 0}
          hint="Across every consultant"
        />
      </div>

      <div className="mt-5 grid items-start gap-5">
        {/*
          Creating staff is how the circle of people who can see every client
          file grows, so it is super-admin only — the rule `assignableRoles`
          already applies to granting a staff role, applied at the point of
          creation. The route checks it again; this only declines to draw a
          form that would be refused.
        */}
        {isSuperAdmin && (
          <Panel title="Add a consultant">
            <p className="mb-4 text-[0.88rem] leading-relaxed text-muted">
              They cannot sign themselves up — an account made here is the only way in. No
              password is chosen for them: they get a single-use link and pick their own.
            </p>
            {!mailConfigured() && (
              <p className="note-warn mb-4 p-3 text-[0.82rem] leading-relaxed">
                Email is not configured on this deployment, so nothing will be sent
                automatically. The link will appear here for you to pass on.
              </p>
            )}
            <AddConsultant />
          </Panel>
        )}

        <Panel>
          {consultants.length === 0 ? (
            <EmptyState
              icon="search"
              title="No consultants yet"
              body={
                isSuperAdmin
                  ? "Add one above. They can enrol their own students straight away."
                  : "A super administrator can add one."
              }
            />
          ) : (
            <ConsultantList consultants={consultants} clients={clients} canViewAs={isSuperAdmin} />
          )}
        </Panel>
      </div>

      <p className="mt-5 text-[0.82rem] leading-relaxed text-faint">
        &ldquo;Waiting on the student&rdquo; counts cases stalled on them rather than on us —
        documents required, or awaiting a reply. Everything else sits in our own queues.
      </p>
    </>
  );
}

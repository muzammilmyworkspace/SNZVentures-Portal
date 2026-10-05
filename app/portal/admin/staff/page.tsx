import { MessageBar } from "@/components/portal/MessageBar";
import { getAdvisorsWithLoad, getClientsByAdvisor, getStaffProfiles } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { mailConfigured } from "@/lib/mail";
import { PortalHeading, Panel, EmptyState, StatCard } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { AddStaffButton } from "@/components/portal/AddStaffButton";
import { ConsultantList } from "@/components/portal/ConsultantList";
import { requireArea } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * Consultants — one row each: number, code, name, email, students, the
 * active switch, and the actions (view as, details, delete). "Add consultant"
 * at the top right opens the window that creates the account and emails the
 * set-up link (super admin only, checked again by the API).
 */
export default async function ConsultantsPage() {
  const { session } = await requireArea("consultants");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Manage" title="Consultants" />
        <NotConfigured what="Staff management" />
      </>
    );
  }

  const isSuperAdmin = session.role === "super_admin";
  // Sequential: one connection, and concurrent reads starve rather than queue.
  const all = await getAdvisorsWithLoad();
  const clients = await getClientsByAdvisor();
  const profiles = await getStaffProfiles();
  const people = all.filter((c) => c.role === "advisor");
  const emailOff = !(await mailConfigured());
  const students = people.reduce((n, c) => n + c.clientCount, 0);
  const waiting = people.reduce((n, c) => n + c.needsAttention, 0);

  return (
    <>
      <PortalHeading
        eyebrow="Manage"
        title="Consultants"
        lead="The people who enrol students. Add one, see who each one carries, or step into their side of the portal."
        action={isSuperAdmin ? <AddStaffButton kind="consultant" /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Consultants" value={people.length} />
        <StatCard label="Students enrolled" value={students} />
        <StatCard label="Waiting on the student" value={waiting} urgent={waiting > 0} hint="Across every consultant" />
      </div>

      {isSuperAdmin && emailOff && (
        <p className="note-warn mt-4 p-3 text-[0.82rem] leading-relaxed">
          Email is not set up on this deployment, so a new consultant gets no email. The set-up link is
          shown to you after adding them, to pass on yourself.
        </p>
      )}

      <Panel className="mt-5" padded={people.length === 0}>
        {people.length === 0 ? (
          <EmptyState
            icon="search"
            title="No consultants yet"
            body={isSuperAdmin ? "Use Add consultant at the top right." : "A super administrator can add one."}
          />
        ) : (
          <>
            {/* Message all of them at once; each gets it in their own chat. */}
            <MessageBar picked={[]} total={people.length} filter={{ role: "consultants" }} viewLabel="Consultants" />
            <ConsultantList
              consultants={people}
              clients={clients}
              profiles={profiles}
              canViewAs={isSuperAdmin}
              canDelete={isSuperAdmin}
              canEdit={isSuperAdmin}
              viewerId={session.userId}
              kind="consultant"
            />
          </>
        )}
      </Panel>
    </>
  );
}

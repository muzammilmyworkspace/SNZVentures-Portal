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
 * Employees — one row each: number, ID, name, email, access, the
 * active switch, and the actions (view as, details, delete). "Add employee"
 * at the top right opens the window that creates the account and emails the
 * set-up link (super admin only, checked again by the API).
 */
export default async function EmployeesPage() {
  const { session } = await requireArea("employees");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Manage" title="Employees" />
        <NotConfigured what="Staff management" />
      </>
    );
  }

  const isSuperAdmin = session.role === "super_admin";
  // Sequential: one connection, and concurrent reads starve rather than queue.
  const all = await getAdvisorsWithLoad();
  const clients = await getClientsByAdvisor();
  const profiles = await getStaffProfiles();
  const people = all.filter((c) => c.role === "admin" || c.role === "super_admin");
  const emailOff = !(await mailConfigured());
  const active = people.filter((c) => c.status === "active").length;
  const limited = people.filter((c) => c.role === "admin" && c.permissions != null).length;

  return (
    <>
      <PortalHeading
        eyebrow="Manage"
        title="Employees"
        lead="The SnZ Ventures team. Add someone and choose what they may use; they see only that once they sign in."
        action={isSuperAdmin ? <AddStaffButton kind="employee" /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Employees" value={people.length} />
        <StatCard label="Active" value={active} />
        <StatCard label="With limited access" value={limited} hint="Can open only the areas they were given" />
      </div>

      {isSuperAdmin && emailOff && (
        <p className="note-warn mt-4 p-3 text-[0.82rem] leading-relaxed">
          Email is not set up on this deployment, so a new employee gets no email. The set-up link is
          shown to you after adding them, to pass on yourself.
        </p>
      )}

      <Panel className="mt-5" padded={people.length === 0}>
        {people.length === 0 ? (
          <EmptyState
            icon="search"
            title="No employees yet"
            body={isSuperAdmin ? "Use Add employee at the top right." : "A super administrator can add one."}
          />
        ) : (
          <>
            {/* Message all of them at once; each gets it in their own chat. */}
            <MessageBar picked={[]} total={people.length} filter={{ role: "employees" }} viewLabel="Employees" />
            <ConsultantList
              consultants={people}
              clients={clients}
              profiles={profiles}
              canViewAs={isSuperAdmin}
              canDelete={isSuperAdmin}
              canEdit={isSuperAdmin}
              viewerId={session.userId}
              kind="employee"
            />
          </>
        )}
      </Panel>
    </>
  );
}

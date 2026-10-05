import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { UsersView } from "@/components/portal/UsersView";

/** The firm's own staff (admins and super admins). The Users list, fixed to them. */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requireAdmin();
  const raw = await searchParams;
  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Manage" title="Employees" />
        <NotConfigured what="User management" />
      </>
    );
  }
  return (
    <UsersView
      raw={raw}
      actorRole={session.role}
      actorId={session.userId}
      basePath="/portal/admin/employees"
      fixedGroup="employees"
      eyebrow="Manage"
      title="Employees"
      lead="The SnZ Ventures team with admin access. Message them all at once, or open anyone's history."
    />
  );
}

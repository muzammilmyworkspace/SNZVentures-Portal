import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { UsersView } from "@/components/portal/UsersView";
import { requireArea } from "@/lib/auth/permissions";

/** Everyone on the portal: students, consultants and employees. See UsersView. */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requireArea("users");
  const raw = await searchParams;
  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Manage" title="Users" />
        <NotConfigured what="User management" />
      </>
    );
  }
  return (
    <UsersView
      raw={raw}
      actorRole={session.role}
      actorId={session.userId}
      basePath="/portal/admin/users"
      eyebrow="Manage"
      title="Users"
      lead="Everyone who uses the portal. Filter by group, tick people to send them a message, open the clock for anyone's history. Every change is written to the audit log."
    />
  );
}

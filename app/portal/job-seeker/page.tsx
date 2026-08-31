import { requireRole } from "@/lib/auth/guard";
import { ClientDashboard } from "@/components/portal/ClientDashboard";

/**
 * job-seeker dashboard.
 *
 * `requireRole` runs on the SERVER and redirects anyone whose session says
 * otherwise, so this URL cannot be used to view another audience's workspace.
 * The role is read from the signed cookie, never from the path.
 */
export default async function Page() {
  const { session } = await requireRole(["professional"], "/portal/job-seeker");
  return <ClientDashboard session={session} />;
}

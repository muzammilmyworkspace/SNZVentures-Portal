import { requireRole } from "@/lib/auth/guard";
import { StudentHome } from "@/components/portal/StudentHome";

/**
 * Student dashboard.
 *
 * `requireRole` runs on the SERVER and redirects anyone whose session says
 * otherwise, so this URL cannot be used to view another audience's workspace.
 * The role is read from the signed cookie, never from the path.
 *
 * SNZ (2026-10-24): there is no fee step any more, so the fee dialog that
 * used to sit above the dashboard is gone.
 */
export default async function Page() {
  const { session } = await requireRole(["student"], "/portal/student");
  return <StudentHome session={session} />;
}

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";

/**
 * Unassigned is gone from the sidebar: students are found, filtered and
 * assigned from Users (and a student's consultant is set on their file). The
 * old address opens the Students view of Users.
 */
export default async function UnassignedPage() {
  await requireAdmin();
  redirect("/portal/admin/users?role=students");
}

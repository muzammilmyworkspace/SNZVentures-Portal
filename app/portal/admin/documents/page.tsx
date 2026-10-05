import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";

/**
 * The old firm-wide Documents queue. Documents are now reviewed beside each
 * application, from the documents button on every pipeline row (approve, or
 * ask for a new copy), so this address sends people there.
 */
export default async function AdminDocumentsPage() {
  await requireAdmin();
  redirect("/portal/admin/requests");
}

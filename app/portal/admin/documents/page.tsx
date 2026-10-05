import { redirect } from "next/navigation";

/**
 * The old firm-wide Documents queue. Documents are now reviewed beside each
 * application, from the documents button on every pipeline row (approve, or
 * ask for a new copy), so this address sends people there.
 */
export default function AdminDocumentsPage() {
  redirect("/portal/admin/requests");
}

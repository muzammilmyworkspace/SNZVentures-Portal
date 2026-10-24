import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/** Setup › Forms opens on the application form (the consent form for anyone who cannot edit it). */
export default async function FormsPage() {
  const session = await getSession();
  redirect(session?.role === "super_admin" ? "/portal/admin/forms/application" : "/portal/admin/forms/consent");
}

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";

/**
 * Analytics repeated the dashboard: every figure it showed is on the
 * dashboard, which also has the date filter. The old address goes there.
 */
export default async function AnalyticsPage() {
  await requireAdmin();
  redirect("/portal/admin");
}

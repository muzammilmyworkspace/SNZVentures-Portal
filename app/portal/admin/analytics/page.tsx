import { redirect } from "next/navigation";

/**
 * Analytics repeated the dashboard: every figure it showed is on the
 * dashboard, which also has the date filter. The old address goes there.
 */
export default function AnalyticsPage() {
  redirect("/portal/admin");
}

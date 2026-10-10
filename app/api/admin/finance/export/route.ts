import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { financeWorkbook } from "@/lib/portal/finance-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The finance workbook as an Excel file: a month (?m=2026-10) or a year
 * (?year=2026). Super admin only.
 */
export async function GET(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const m = url.searchParams.get("m");
  const y = url.searchParams.get("year");
  let from: string, to: string, label: string;
  if (m && /^\d{4}-\d{2}$/.test(m)) [from, to, label] = [m, m, m];
  else if (y && /^\d{4}$/.test(y)) [from, to, label] = [`${y}-01`, `${y}-12`, y];
  else return new Response("Choose a month or a year.", { status: 400 });

  const file = await financeWorkbook(from, to);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="SnZ-finance-${label}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

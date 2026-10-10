import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { financeWorkbook } from "@/lib/portal/finance-workbook";
import { resolveRange } from "@/lib/portal/finance-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The finance workbook as an Excel file, for the report's dates: ?range=last30,
 * ?from=2026-09-01&to=2026-09-30, a month (?m=2026-10) or a year (?year=2026).
 * Super admin only.
 */
export async function GET(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const y = sp.year;
  const r = y && /^\d{4}$/.test(y) ? { from: `${y}-01-01`, to: `${y}-12-31` } : resolveRange(sp, new Date().toISOString().slice(0, 10));
  const label = y && /^\d{4}$/.test(y) ? y : r.from === r.to ? r.from : `${r.from}_to_${r.to}`;

  const file = await financeWorkbook(r.from, r.to);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="SnZ-finance-${label}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

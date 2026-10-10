import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { financeWorkbook } from "@/lib/portal/finance-workbook";
import { receiptsBetween } from "@/lib/db/repos/finance";
import { lastDay } from "@/lib/portal/finance-view";
import { getSignedUrl } from "@/lib/storage";
import { buildZip, safeEntryName, type ZipEntry } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/**
 * THE PACK FOR THE ACCOUNTANT: one ZIP with the month's Excel workbook and
 * every receipt of that month (verified fee slips and receipts attached to
 * entries), named by date. Anything that could not be read is listed in a
 * note inside, so the pack never looks complete when it is not.
 */
export async function GET(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const m = new URL(request.url).searchParams.get("m") ?? "";
  if (!/^\d{4}-\d{2}$/.test(m)) return new Response("Choose a month.", { status: 400 });

  const entries: ZipEntry[] = [{ name: `SnZ-finance-${m}.xlsx`, data: await financeWorkbook(m, m) }];
  const receipts = await receiptsBetween(`${m}-01`, lastDay(m));
  const taken = new Set<string>();
  const failed: string[] = [];
  let total = 0;
  // One at a time: a burst of reads is the quickest way to be throttled by the store.
  for (const r of receipts) {
    if (total >= MAX_TOTAL_BYTES) {
      failed.push(`${r.label} (pack full)`);
      continue;
    }
    try {
      const res = await fetch(await getSignedUrl(r.key, 120, r.provider as never), { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const bytes = Buffer.from(await res.arrayBuffer());
      total += bytes.length;
      const ext = (r.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? "").toLowerCase();
      entries.push({ name: `Receipts/${safeEntryName(`${r.date} ${r.label}${ext}`, taken)}`, data: bytes });
    } catch {
      failed.push(`${r.date} ${r.label}`);
    }
  }
  if (!receipts.length) {
    entries.push({ name: "Receipts/none.txt", data: Buffer.from(`No receipts were attached to ${m}'s entries.\n`, "utf8") });
  }
  if (failed.length) {
    entries.push({
      name: "MISSING receipts - read me.txt",
      data: Buffer.from(`These receipts could not be added; open them in the portal:\n\n${failed.map((f) => `  - ${f}`).join("\n")}\n`, "utf8"),
    });
  }

  const zip = buildZip(entries);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="SnZ-finance-${m}-for-accountant.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

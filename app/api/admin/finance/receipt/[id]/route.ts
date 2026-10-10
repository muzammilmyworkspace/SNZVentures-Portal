import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { getEntry, getRecurringBill } from "@/lib/db/repos/finance";
import { getSignedUrl } from "@/lib/storage";

/** The receipt attached to a finance entry. Super admin only; short-lived link. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const entry = await getEntry(id);
  const file = entry?.receiptKey
    ? { key: entry.receiptKey, provider: entry.receiptProvider }
    : await getRecurringBill(id);
  if (!file) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  try {
    return NextResponse.redirect(await getSignedUrl(file.key, 120, file.provider as never), { status: 302 });
  } catch {
    return NextResponse.json({ ok: false, error: "The receipt could not be opened." }, { status: 502 });
  }
}

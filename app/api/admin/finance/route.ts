import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  addEntry,
  setEntryStatus,
  deleteEntry,
  getEntry,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  setRate,
  clearManualRate,
  setRecurringBill,
  setTerms,
  addPayout,
  setPayoutPaid,
  deletePayout,
  addUniversity,
  deleteUniversity,
  addCommission,
  setCommissionReceived,
  deleteCommission,
  listStakeholders,
  saveStakeholder,
  setStakeholderActive,
  deleteStakeholder,
  recordDistribution,
  undoDistribution,
  updateEntry,
  linesBetween,
  allRates,
  materializeRecurring,
  materializePayouts,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@/lib/db/repos/finance";
import { CURRENCIES } from "@/lib/invoices/model";
import { totals, lastDay } from "@/lib/portal/finance-view";
import { putObject, buildKey, validateUpload, isStorageConfigured, deleteObject } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FINANCE — super admin only. One POST (multipart) with an `action`:
 *   add_entry       income or expense, optional receipt
 *   entry_status    paid / due
 *   delete_entry    a typed-in entry (a fixed cost's month is stopped from Fixed costs)
 *   add_recurring / update_recurring / delete_recurring   fixed monthly costs
 *   set_rate        units of a currency per euro, for a month
 */

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const CURRENCY = Object.keys(CURRENCIES);

/** "1,250.50" -> 125050 cents, or null. */
function cents(v: FormDataEntryValue | null): number | null {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e10 ? Math.round(n * 100) : null;
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const today = () => new Date().toISOString().slice(0, 10);

export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (!rateLimit(`finance:${session.userId}`, { limit: 200, windowMs: 10 * 60_000 }).ok) return bad("Slow down a moment.", 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Invalid request.");
  }
  const action = String(form.get("action") ?? "");
  const text = (k: string, n = 200) => String(form.get(k) ?? "").trim().slice(0, n);

  if (action === "add_entry") {
    const kind = form.get("kind") === "income" ? "income" : "expense";
    const category = text("category", 80);
    const allowed: readonly string[] = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!allowed.includes(category)) return bad("Choose a category.");
    const description = text("description", 300);
    if (description.length < 2) return bad("Say what it is for.");
    const amount = cents(form.get("amount"));
    if (!amount) return bad("Enter the amount.");
    const currency = text("currency", 3);
    if (!CURRENCY.includes(currency)) return bad("Choose the currency.");
    const occurredOn = text("date", 10);
    if (!ISO.test(occurredOn)) return bad("Choose the date.");
    const status = form.get("status") === "due" ? "due" : "paid";

    let receipt: { key: string; name: string; type: string; provider: string } | null = null;
    const f = form.get("receipt");
    if (f instanceof File && f.size > 0) {
      const invalid = validateUpload({ size: f.size, type: f.type, name: f.name });
      if (invalid) return bad(invalid);
      if (!isStorageConfigured()) return bad("File storage is not set up, so the receipt cannot be uploaded. Save it without one.", 503);
      const put = await putObject(buildKey("finance", f.name), Buffer.from(await f.arrayBuffer()), f.type);
      receipt = { key: put.key, name: f.name.slice(0, 160), type: f.type, provider: put.provider };
    }

    const studentId = UUID.test(text("studentId", 40)) ? text("studentId", 40) : null;
    const id = await addEntry({
      kind,
      category,
      description,
      party: text("party", 160) || null,
      studentId,
      amountCents: amount,
      currency,
      occurredOn,
      status,
      receipt,
      createdBy: session.userId,
    });
    return id ? NextResponse.json({ ok: true, id }) : bad("That didn't save.", 503);
  }

  if (action === "entry_status") {
    const ok = await setEntryStatus(text("id", 40), form.get("status") === "due" ? "due" : "paid");
    return ok ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "delete_entry") {
    const entry = await getEntry(text("id", 40));
    if (!entry) return bad("Not found.", 404);
    if (entry.recurringId) return bad("This month of a fixed cost stays. Stop or change the fixed cost under Fixed costs.", 409);
    if (!(await deleteEntry(entry.id))) return bad("That didn't delete.", 409);
    if (entry.receiptKey) await deleteObject(entry.receiptKey, entry.receiptProvider as never).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (action === "add_recurring" || action === "update_recurring") {
    // The bill (photo or PDF) it is based on, optional.
    let bill: { key: string; name: string; type: string; provider: string } | null = null;
    const billFile = form.get("bill");
    if (billFile instanceof File && billFile.size > 0) {
      const invalid = validateUpload({ size: billFile.size, type: billFile.type, name: billFile.name });
      if (invalid) return bad(invalid);
      if (!isStorageConfigured()) return bad("File storage is not set up, so the bill cannot be uploaded. Save it without one.", 503);
      const put = await putObject(buildKey("finance", billFile.name), Buffer.from(await billFile.arrayBuffer()), billFile.type);
      bill = { key: put.key, name: billFile.name.slice(0, 160), type: billFile.type, provider: put.provider };
    }
    const name = text("name", 160);
    const category = text("category", 80);
    const amount = cents(form.get("amount"));
    const currency = text("currency", 3);
    const dayOfMonth = Math.min(28, Math.max(1, Number(form.get("day")) || 1));
    if (action === "add_recurring") {
      if (name.length < 2) return bad("Name the cost, e.g. Office rent.");
      if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return bad("Choose a category.");
      if (!amount) return bad("Enter the monthly amount.");
      if (!CURRENCY.includes(currency)) return bad("Choose the currency.");
      const startsOn = text("starts", 7);
      if (!/^\d{4}-\d{2}$/.test(startsOn)) return bad("Choose the month it starts.");
      const ok = await addRecurring({
        name,
        category,
        amountCents: amount,
        currency,
        dayOfMonth,
        autoPaid: form.get("autoPaid") === "1",
        startsOn: `${startsOn}-01`,
        notes: text("notes", 500) || null,
        createdBy: session.userId,
        bill,
      });
      return ok ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
    }
    if (bill) {
      const old = await setRecurringBill(text("id", 40), bill);
      if (old?.key) await deleteObject(old.key, old.provider as never).catch(() => undefined);
    }
    const ok = await updateRecurring(text("id", 40), {
      ...(name ? { name } : {}),
      ...((EXPENSE_CATEGORIES as readonly string[]).includes(category) ? { category } : {}),
      ...(amount ? { amountCents: amount } : {}),
      ...(CURRENCY.includes(currency) ? { currency } : {}),
      ...(form.get("day") ? { dayOfMonth } : {}),
      ...(form.get("autoPaid") != null ? { autoPaid: form.get("autoPaid") === "1" } : {}),
      ...(form.get("active") != null ? { active: form.get("active") === "1" } : {}),
    });
    return ok ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "delete_recurring") {
    const ok = await deleteRecurring(text("id", 40));
    return ok ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "rate_auto") {
    const month = text("month", 7);
    const currency = text("currency", 3);
    if (!/^\d{4}-\d{2}$/.test(month) || !CURRENCY.includes(currency)) return bad("Invalid request.");
    return (await clearManualRate(`${month}-01`, currency)) ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
  }

  if (action === "set_rate") {
    const month = text("month", 7);
    const currency = text("currency", 3);
    const perEur = parseFloat(text("perEur", 20).replace(/,/g, ""));
    if (!/^\d{4}-\d{2}$/.test(month)) return bad("Choose the month.");
    if (!CURRENCY.includes(currency) || currency === "EUR") return bad("Choose the currency.");
    if (!Number.isFinite(perEur) || perEur <= 0) return bad("Enter how many make one euro, e.g. 300.");
    const ok = await setRate(`${month}-01`, currency, perEur);
    return ok ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
  }

  /* ----------------------------------------------- consultant shares */
  if (action === "set_terms") {
    const consultantId = text("consultantId", 40);
    if (!UUID.test(consultantId)) return bad("Which consultant?");
    if (form.get("remove") === "1") {
      return (await setTerms({ consultantId, remove: true })) ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
    }
    const kind = form.get("kind") === "fixed" ? "fixed" : "percent";
    const value = parseFloat(text("value", 20).replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0 || (kind === "percent" && value > 100)) {
      return bad(kind === "percent" ? "Enter a percentage between 0 and 100." : "Enter the amount per student.");
    }
    const currency = text("currency", 3) || "EUR";
    if (!CURRENCY.includes(currency)) return bad("Choose the currency.");
    const startsOn = text("startsOn", 10) || today();
    if (!ISO.test(startsOn)) return bad("Choose the date it starts from.");
    const ok = await setTerms({ consultantId, kind, value, currency, startsOn });
    return ok ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
  }

  if (action === "add_payout") {
    const consultantId = text("consultantId", 40);
    if (!UUID.test(consultantId)) return bad("Choose the consultant.");
    const amount = cents(form.get("amount"));
    if (!amount) return bad("Enter the amount.");
    const currency = text("currency", 3);
    if (!CURRENCY.includes(currency)) return bad("Choose the currency.");
    const description = text("description", 300);
    if (description.length < 2) return bad("Say what it is for.");
    const studentId = UUID.test(text("studentId", 40)) ? text("studentId", 40) : null;
    const ok = await addPayout({ consultantId, studentId, description, amountCents: amount, currency, createdBy: session.userId });
    return ok ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
  }

  if (action === "payout_paid" || action === "payout_unpaid") {
    const on = text("date", 10) || today();
    const ok = await setPayoutPaid(text("id", 40), action === "payout_paid", ISO.test(on) ? on : today(), session.userId);
    return ok ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "delete_payout") {
    return (await deletePayout(text("id", 40))) ? NextResponse.json({ ok: true }) : bad("A paid share cannot be deleted. Mark it unpaid first.", 409);
  }

  /* ------------------------------------------ university commissions */
  if (action === "add_university") {
    const name = text("name", 160);
    if (name.length < 2) return bad("Enter the university name.");
    const kind = form.get("kind") === "percent" ? "percent" : "fixed";
    const raw = text("value", 20);
    const value = raw ? parseFloat(raw.replace(/,/g, "")) : null;
    if (value != null && (!Number.isFinite(value) || value <= 0)) return bad("Enter the commission, or leave it empty.");
    const currency = text("currency", 3) || "EUR";
    const ok = await addUniversity({ name, kind, value, currency: CURRENCY.includes(currency) ? currency : "EUR", notes: text("notes", 500) || null });
    return ok ? NextResponse.json({ ok: true }) : bad("That university is already listed.", 409);
  }

  if (action === "delete_university") {
    return (await deleteUniversity(text("id", 40)))
      ? NextResponse.json({ ok: true })
      : bad("Commissions already received from it stay, so it cannot be deleted.", 409);
  }

  if (action === "add_commission") {
    const universityId = text("universityId", 40);
    if (!UUID.test(universityId)) return bad("Choose the university.");
    const studentId = UUID.test(text("studentId", 40)) ? text("studentId", 40) : null;
    const studentName = text("studentName", 160);
    if (studentName.length < 2) return bad("Choose or type the student.");
    const amount = cents(form.get("amount"));
    if (!amount) return bad("Enter the commission amount.");
    const currency = text("currency", 3);
    if (!CURRENCY.includes(currency)) return bad("Choose the currency.");
    const expectedOn = text("expectedOn", 10);
    const ok = await addCommission({
      universityId,
      studentId,
      studentName,
      intake: text("intake", 80) || null,
      amountCents: amount,
      currency,
      expectedOn: ISO.test(expectedOn) ? expectedOn : null,
      createdBy: session.userId,
    });
    return ok ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
  }

  if (action === "commission_received" || action === "commission_unreceived") {
    const on = text("date", 10) || today();
    const ok = await setCommissionReceived(text("id", 40), action === "commission_received", ISO.test(on) ? on : today(), session.userId);
    return ok ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "delete_commission") {
    return (await deleteCommission(text("id", 40))) ? NextResponse.json({ ok: true }) : bad("A received commission cannot be deleted. Mark it not received first.", 409);
  }

  /* ----------------------------------------------------- edit an entry */
  if (action === "update_entry") {
    const kind = form.get("kind") === "income" ? "income" : "expense";
    const category = text("category", 80);
    const allowed: readonly string[] = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (!allowed.includes(category)) return bad("Choose a category.");
    const description = text("description", 300);
    if (description.length < 2) return bad("Say what it is for.");
    const amount = cents(form.get("amount"));
    if (!amount) return bad("Enter the amount.");
    const currency = text("currency", 3);
    if (!CURRENCY.includes(currency)) return bad("Choose the currency.");
    const occurredOn = text("date", 10);
    if (!ISO.test(occurredOn)) return bad("Choose the date.");
    const ok = await updateEntry(text("id", 40), {
      category,
      description,
      party: text("party", 160) || null,
      amountCents: amount,
      currency,
      occurredOn,
      status: form.get("status") === "due" ? "due" : "paid",
    });
    return ok ? NextResponse.json({ ok: true }) : bad("Only entries added by hand can be edited here.", 409);
  }

  /* ------------------------------------------------------ stakeholders */
  if (action === "save_stakeholder") {
    const name = text("name", 120);
    if (name.length < 2) return bad("Enter the name.");
    const pct = parseFloat(text("sharePct", 10));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return bad("Enter the share as a percentage, e.g. 25.");
    const id = text("id", 40);
    // The shares of everyone active must not add up to more than 100%.
    const others = (await listStakeholders()).filter((x) => x.active && x.id !== id).reduce((n, x) => n + x.sharePct, 0);
    if (others + pct > 100.001) return bad(`That makes ${others + pct}%. Shares cannot add up to more than 100%.`);
    const ok = await saveStakeholder({
      id: UUID.test(id) ? id : undefined,
      name,
      sharePct: pct,
      isCompany: form.get("isCompany") === "1",
      notes: text("notes", 300) || null,
    });
    return ok ? NextResponse.json({ ok: true }) : bad("That didn't save.", 503);
  }

  if (action === "stakeholder_active") {
    const ok = await setStakeholderActive(text("id", 40), form.get("active") === "1");
    return ok ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "delete_stakeholder") {
    return (await deleteStakeholder(text("id", 40)))
      ? NextResponse.json({ ok: true })
      : bad("They have been paid before, so they are kept. Switch them off instead.", 409);
  }

  if (action === "distribute" || action === "undistribute") {
    const stakeholderId = text("stakeholderId", 40);
    const month = text("month", 7);
    if (!UUID.test(stakeholderId) || !/^\d{4}-\d{2}$/.test(month)) return bad("Invalid request.");
    if (action === "undistribute") {
      return (await undoDistribution(stakeholderId, month)) ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
    }
    const holder = (await listStakeholders()).find((x) => x.id === stakeholderId);
    if (!holder) return bad("Not found.", 404);
    // Worked out here from the month's books, never taken from the browser.
    await materializeRecurring();
    await materializePayouts();
    const [lines, rates] = await Promise.all([linesBetween(`${month}-01`, lastDay(month)), allRates()]);
    const profit = totals(lines, rates).profit;
    const amount = Math.max(0, Math.round((profit * holder.sharePct) / 100));
    const paidOn = text("date", 10) || today();
    const ok = await recordDistribution({ stakeholderId, month, amountCents: amount, paidOn: ISO.test(paidOn) ? paidOn : today(), by: session.userId });
    return ok ? NextResponse.json({ ok: true, amount }) : bad("That didn't save.", 503);
  }

  return bad("Unknown action.");
}

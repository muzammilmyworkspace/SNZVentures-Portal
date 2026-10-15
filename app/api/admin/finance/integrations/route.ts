import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/auth/rate-limit";
import { seal } from "@/lib/integrations/secret-box";
import { stripeBalance, wiseConnect, csvLines } from "@/lib/integrations/finance-providers";
import {
  createIntegration,
  deleteIntegration,
  setIntegrationAccount,
  saveBankLines,
  autoMatch,
  recordSync,
  addLineAsEntry,
  addLineAsTransfer,
  setLineStatus,
  type Provider,
} from "@/lib/db/repos/finance-integrations";
import { listAccounts, saveAccount, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/db/repos/finance";
import { syncIntegration } from "@/lib/portal/finance-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * FINANCE INTEGRATIONS — super admin only. One POST (multipart) with an `action`:
 *   connect        provider + token (Wise, Stripe) or a CSV-only bank, linked to a money account
 *   sync           read the provider's balance and new statement lines
 *   upload_csv     a statement CSV for a connection
 *   link           change which money account a connection belongs to
 *   disconnect     delete it and its token (entries already added stay)
 *   line_add       a statement line into the books, as money in or out
 *   line_transfer  a statement line into the books, as a move between own accounts
 *   line_ignore / line_reset
 */

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const UUID = /^[0-9a-f-]{36}$/i;
const PROVIDERS: Provider[] = ["wise", "stripe", "revolut", "csv"];

export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (!rateLimit(`finance-int:${session.userId}`, { limit: 120, windowMs: 10 * 60_000 }).ok) return bad("Slow down a moment.", 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Invalid request.");
  }
  const action = String(form.get("action") ?? "");
  const text = (k: string, n = 200) => String(form.get(k) ?? "").trim().slice(0, n);
  const id = text("id", 40);

  if (action === "connect") {
    const provider = text("provider", 10) as Provider;
    if (!PROVIDERS.includes(provider)) return bad("Choose what to connect.");
    // The money account: one chosen, or a new one made for this connection.
    let accountId = UUID.test(text("accountId", 40)) ? text("accountId", 40) : null;
    if (!accountId) {
      const name = text("newAccount", 80);
      if (name.length < 2) return bad("Choose the account it belongs to, or name a new one.");
      const currency = text("currency", 3) || "EUR";
      const made = await saveAccount({ name, kind: "bank", currency, openingCents: 0, openingOn: new Date().toISOString().slice(0, 10), defaultIn: false });
      if (!made) return bad("An account with that name already exists. Choose it from the list.", 409);
      accountId = (await listAccounts()).find((a) => a.name === name)?.id ?? null;
    }
    const account = (await listAccounts()).find((a) => a.id === accountId);
    if (!account) return bad("Choose the account it belongs to.");
    const label = text("label", 80) || `${provider === "wise" ? "Wise Business" : provider === "stripe" ? "Stripe" : provider === "revolut" ? "Revolut Business" : "Bank"} · ${account.name}`;

    if (provider === "wise" || provider === "stripe") {
      const token = text("token", 400);
      if (token.length < 10) return bad(provider === "wise" ? "Paste the Wise API token." : "Paste the Stripe restricted key.");
      if (provider === "stripe" && /^sk_/.test(token)) {
        return bad("That is a full secret key. Create a restricted key with read-only access instead (Developers → API keys → Create restricted key).");
      }
      // Tested before it is saved: a token that does not work is never stored.
      const check = provider === "stripe" ? await stripeBalance(token, account.currency) : await wiseConnect(token, account.currency);
      if (!check.ok) return bad(check.error);
      const meta: Record<string, unknown> = provider === "wise" && "profileId" in check.value ? { profileId: check.value.profileId, balanceId: check.value.balanceId, profileName: check.value.profileName } : {};
      const newId = await createIntegration({ provider, label, accountId, sealedSecret: seal(token), meta, by: session.userId });
      if (!newId) return bad("That didn't save.", 503);
      await recordSync(newId, { ok: true, balanceCents: check.value.cents, currency: check.value.currency });
      const first = await syncIntegration(newId);
      return NextResponse.json({ ok: true, id: newId, message: `Connected. ${first.message}` });
    }

    const newId = await createIntegration({ provider, label, accountId, sealedSecret: null, meta: {}, by: session.userId });
    return newId ? NextResponse.json({ ok: true, id: newId, message: "Added. Upload its statement CSV to bring the transactions in." }) : bad("That didn't save.", 503);
  }

  if (action === "sync") {
    if (!UUID.test(id)) return bad("Which connection?");
    const r = await syncIntegration(id);
    return r.ok ? NextResponse.json({ ok: true, message: r.message }) : bad(r.message, 502);
  }

  if (action === "upload_csv") {
    if (!UUID.test(id)) return bad("Which connection?");
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) return bad("Choose the statement CSV.");
    if (f.size > 5 * 1024 * 1024) return bad("That file is over 5 MB. Export a shorter period.");
    const currency = text("currency", 3) || "EUR";
    const parsed = csvLines(await f.text(), currency);
    if (!parsed.ok) return bad(parsed.error);
    const added = await saveBankLines(id, parsed.value.lines);
    const matched = await autoMatch(id);
    await recordSync(id, { ok: true });
    return NextResponse.json({
      ok: true,
      message: `${parsed.value.lines.length} lines read · ${added} new · ${matched} matched to the books${parsed.value.skipped ? ` · ${parsed.value.skipped} skipped (no date or amount)` : ""}.`,
    });
  }

  if (action === "link") {
    if (!UUID.test(id)) return bad("Which connection?");
    const accountId = UUID.test(text("accountId", 40)) ? text("accountId", 40) : null;
    return (await setIntegrationAccount(id, accountId, text("label", 80) || undefined)) ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "disconnect") {
    return (await deleteIntegration(id)) ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  if (action === "line_add") {
    const category = text("category", 80);
    const all: readonly string[] = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
    if (!all.includes(category)) return bad("Choose a category.");
    const ok = await addLineAsEntry(id, {
      category,
      partnerCost: form.get("partnerCost") !== "0",
      vatMode: form.get("vatMode") === "reverse_charge" ? "reverse_charge" : "none",
      by: session.userId,
    });
    return ok ? NextResponse.json({ ok: true }) : bad("That line was already handled.", 409);
  }

  if (action === "line_transfer") {
    const other = text("otherAccountId", 40);
    if (!UUID.test(other)) return bad("Choose the other account.");
    const raw = text("otherAmount", 20).replace(/,/g, "");
    const otherCents = raw ? Math.round(parseFloat(raw) * 100) : null;
    if (otherCents != null && (!Number.isFinite(otherCents) || otherCents <= 0)) return bad("Enter the amount in the other account, or leave it empty.");
    const ok = await addLineAsTransfer(id, other, otherCents, session.userId);
    return ok ? NextResponse.json({ ok: true }) : bad("That line was already handled, or its connection has no account.", 409);
  }

  if (action === "line_ignore" || action === "line_reset") {
    return (await setLineStatus(id, action === "line_ignore" ? "ignored" : "new")) ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
  }

  return bad("Unknown action.");
}

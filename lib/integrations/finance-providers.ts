import "server-only";
import { createHash } from "node:crypto";
import type { IncomingLine } from "@/lib/db/repos/finance-integrations";

/**
 * TALKING TO THE PROVIDERS, read only.
 *
 * STRIPE — a restricted key with read access to Balance and Balance
 * transactions. Each balance transaction becomes a statement line (a charge
 * as money in, its fee as a separate line out, a refund out, a payout as a
 * move to the bank).
 *
 * WISE — a Wise Business personal API token (read only). Balances always;
 * statements too where Wise allows them without extra approval (for EU and UK
 * business profiles Wise asks for strong customer authentication on
 * statements, and then the statement CSV is uploaded instead).
 *
 * REVOLUT BUSINESS and any other bank — the statement CSV, read by column
 * name (the date, amount, currency, description columns each bank uses).
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const cents = (v: unknown) => Math.round(Number(v) * 100);

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; data: unknown; headers: Headers }> {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

/* ---------------------------------------------------------------- stripe */

const stripeHeaders = (key: string) => ({ Authorization: `Bearer ${key}` });

/** The Stripe balance in one currency: available plus pending. */
export async function stripeBalance(key: string, currency: string): Promise<Result<{ cents: number; currency: string; livemode: boolean }>> {
  try {
    const r = await getJson("https://api.stripe.com/v1/balance", stripeHeaders(key));
    if (r.status === 401) return { ok: false, error: "Stripe did not accept that key." };
    if (r.status === 403) return { ok: false, error: "That key cannot read the balance. Give the restricted key read access to Balance." };
    if (r.status !== 200) return { ok: false, error: `Stripe answered ${r.status}.` };
    const d = r.data as { available?: { amount: number; currency: string }[]; pending?: { amount: number; currency: string }[]; livemode?: boolean };
    const cur = currency.toLowerCase();
    const sum = (xs?: { amount: number; currency: string }[]) => (xs ?? []).filter((x) => x.currency === cur).reduce((n, x) => n + x.amount, 0);
    return { ok: true, value: { cents: sum(d.available) + sum(d.pending), currency: currency.toUpperCase(), livemode: d.livemode === true } };
  } catch {
    return { ok: false, error: "Could not reach Stripe." };
  }
}

/** Balance transactions since a date (up to 500), as statement lines. */
export async function stripeLines(key: string, sinceIso: string | null): Promise<Result<IncomingLine[]>> {
  const out: IncomingLine[] = [];
  let after: string | null = null;
  const since = sinceIso ? Math.floor(Date.parse(sinceIso) / 1000) - 3 * 86400 : Math.floor(Date.now() / 1000) - 90 * 86400;
  try {
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({ limit: "100", "created[gte]": String(since) });
      if (after) q.set("starting_after", after);
      const r = await getJson(`https://api.stripe.com/v1/balance_transactions?${q}`, stripeHeaders(key));
      if (r.status === 403) return { ok: false, error: "That key cannot read balance transactions. Give it read access to Balance transactions." };
      if (r.status !== 200) return { ok: false, error: `Stripe answered ${r.status}.` };
      const d = r.data as { data: { id: string; amount: number; fee: number; currency: string; created: number; description: string | null; type: string }[]; has_more: boolean };
      for (const t of d.data) {
        const date = new Date(t.created * 1000).toISOString().slice(0, 10);
        const cur = t.currency.toUpperCase();
        out.push({ externalId: t.id, date, amountCents: t.amount, currency: cur, description: t.description || `Stripe ${t.type}`, counterparty: "Stripe", lineType: t.type });
        if (t.fee) out.push({ externalId: `${t.id}:fee`, date, amountCents: -t.fee, currency: cur, description: `Stripe fee (${t.type})`, counterparty: "Stripe", lineType: "fee" });
      }
      if (!d.has_more || !d.data.length) break;
      after = d.data[d.data.length - 1].id;
    }
    return { ok: true, value: out };
  } catch {
    return { ok: false, error: "Could not reach Stripe." };
  }
}

/* ------------------------------------------------------------------ wise */

const WISE = "https://api.transferwise.com";
const wiseHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Finds the business profile and the balance in the account's currency. */
export async function wiseConnect(token: string, currency: string): Promise<Result<{ profileId: number; balanceId: number; cents: number; currency: string; profileName: string }>> {
  try {
    const p = await getJson(`${WISE}/v2/profiles`, wiseHeaders(token));
    if (p.status === 401) return { ok: false, error: "Wise did not accept that token." };
    if (p.status !== 200 || !Array.isArray(p.data)) return { ok: false, error: `Wise answered ${p.status}.` };
    const profiles = p.data as { id: number; type: string; businessName?: string; fullName?: string; details?: { name?: string } }[];
    const prof = profiles.find((x) => String(x.type).toUpperCase() === "BUSINESS") ?? profiles[0];
    if (!prof) return { ok: false, error: "No Wise profile found for that token." };
    const b = await getJson(`${WISE}/v4/profiles/${prof.id}/balances?types=STANDARD`, wiseHeaders(token));
    if (b.status !== 200 || !Array.isArray(b.data)) return { ok: false, error: `Wise answered ${b.status} for the balances.` };
    const balances = b.data as { id: number; currency: string; amount: { value: number; currency: string } }[];
    const bal = balances.find((x) => x.currency === currency.toUpperCase());
    if (!bal) return { ok: false, error: `This Wise profile has no ${currency.toUpperCase()} balance. It has: ${balances.map((x) => x.currency).join(", ") || "none"}.` };
    return {
      ok: true,
      value: { profileId: prof.id, balanceId: bal.id, cents: cents(bal.amount.value), currency: bal.currency, profileName: prof.businessName ?? prof.details?.name ?? prof.fullName ?? "Wise" },
    };
  } catch {
    return { ok: false, error: "Could not reach Wise." };
  }
}

/** Statement lines since a date. Wise may ask for strong customer authentication; then the CSV is the way. */
export async function wiseLines(token: string, meta: { profileId: number; balanceId: number }, currency: string, sinceIso: string | null): Promise<Result<IncomingLine[]>> {
  const start = sinceIso ? new Date(Date.parse(sinceIso) - 3 * 864e5) : new Date(Date.now() - 90 * 864e5);
  const q = new URLSearchParams({ currency: currency.toUpperCase(), intervalStart: start.toISOString(), intervalEnd: new Date().toISOString(), type: "COMPACT" });
  try {
    const r = await getJson(`${WISE}/v1/profiles/${meta.profileId}/balance-statements/${meta.balanceId}/statement.json?${q}`, wiseHeaders(token));
    if (r.status === 403 && r.headers.get("x-2fa-approval")) {
      return { ok: false, error: "Wise asks for extra approval (SCA) to read statements through the API. The balance still updates; upload the statement CSV from Wise for the transactions." };
    }
    if (r.status !== 200) return { ok: false, error: `Wise answered ${r.status} for the statement.` };
    const d = r.data as { transactions?: { referenceNumber: string; date: string; amount: { value: number; currency: string }; details?: { description?: string; senderName?: string; recipient?: { name?: string }; merchant?: { name?: string }; type?: string }; type?: string }[] };
    return {
      ok: true,
      value: (d.transactions ?? []).map((t) => ({
        externalId: t.referenceNumber,
        date: t.date.slice(0, 10),
        amountCents: cents(t.amount.value),
        currency: t.amount.currency,
        description: t.details?.description ?? t.details?.type ?? "Wise transaction",
        counterparty: t.details?.senderName ?? t.details?.recipient?.name ?? t.details?.merchant?.name ?? null,
        lineType: (t.details?.type ?? t.type ?? "").toLowerCase() || null,
      })),
    };
  } catch {
    return { ok: false, error: "Could not reach Wise." };
  }
}

/* ------------------------------------------------------------------- csv */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const pick = (head: string[], names: string[]) => {
  const h = head.map((x) => x.trim().toLowerCase());
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};

function toIsoDate(v: string): string | null {
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(t); // 31-10-2026 or 31/10/2026 (day first, as banks in Europe print it)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const p = Date.parse(t);
  return Number.isNaN(p) ? null : new Date(p).toISOString().slice(0, 10);
}

const num = (v: string) => {
  const t = v.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  // 1.234,56 (European) or 1,234.56
  const n = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const f = parseFloat(n);
  return Number.isFinite(f) ? f : null;
};

/**
 * A bank statement CSV (Revolut Business, Wise, most banks) as statement
 * lines. Columns are found by name; a line without a date or an amount is
 * skipped and counted.
 */
export function csvLines(text: string, fallbackCurrency: string): Result<{ lines: IncomingLine[]; skipped: number }> {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "That file has no lines." };
  const head = rows[0];
  const iDate = pick(head, ["date completed (utc)", "completed date", "date", "date completed", "started date", "created on", "booking date", "transaction date", "value date"]);
  const iAmount = pick(head, ["amount", "total amount", "net amount", "amount (eur)", "value"]);
  const iIn = pick(head, ["paid in", "money in", "credit", "credit amount"]);
  const iOut = pick(head, ["paid out", "money out", "debit", "debit amount"]);
  const iCur = pick(head, ["payment currency", "currency", "orig currency", "account currency"]);
  const iDesc = pick(head, ["description", "reference", "details", "merchant", "payment reference", "narrative"]);
  const iParty = pick(head, ["payer", "payee name", "counterparty", "payer name", "recipient", "beneficiary", "merchant"]);
  const iId = pick(head, ["id", "transferwise id", "transaction id", "reference number"]);
  const iType = pick(head, ["type", "transaction type"]);
  if (iDate < 0 || (iAmount < 0 && iIn < 0 && iOut < 0)) {
    return { ok: false, error: `Could not find the date and amount columns. The first line reads: ${head.join(", ").slice(0, 200)}` };
  }
  const lines: IncomingLine[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();
  for (const r of rows.slice(1)) {
    const date = toIsoDate(r[iDate] ?? "");
    let amount = iAmount >= 0 ? num(r[iAmount] ?? "") : null;
    if (amount == null && (iIn >= 0 || iOut >= 0)) {
      const a = iIn >= 0 ? num(r[iIn] ?? "") ?? 0 : 0;
      const b = iOut >= 0 ? num(r[iOut] ?? "") ?? 0 : 0;
      amount = a - Math.abs(b);
    }
    if (!date || amount == null || amount === 0) {
      skipped++;
      continue;
    }
    const currency = ((iCur >= 0 ? r[iCur] : "") || fallbackCurrency).trim().toUpperCase().slice(0, 3);
    const description = (iDesc >= 0 ? r[iDesc] : "").trim();
    // The bank's id when there is one; else the line itself, numbered when the same line repeats.
    const base = iId >= 0 && r[iId]?.trim() ? r[iId].trim() : createHash("sha1").update(`${date}|${amount}|${currency}|${description}`).digest("hex").slice(0, 20);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push({
      externalId: n > 1 ? `${base}#${n}` : base,
      date,
      amountCents: Math.round(amount * 100),
      currency,
      description: description || "Statement line",
      counterparty: iParty >= 0 && r[iParty]?.trim() ? r[iParty].trim() : null,
      lineType: iType >= 0 && r[iType]?.trim() ? r[iType].trim().toLowerCase() : null,
    });
  }
  return { ok: true, value: { lines, skipped } };
}

import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * FINANCE (migration 038). Super admin only; every caller checks that.
 *
 * Income is read live from verified student fees and paid invoices, plus
 * the manual entries; expenses are the manual entries plus the fixed monthly
 * costs, which `materializeRecurring` writes into each month once.
 */

export { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/portal/finance-categories";

export type FinanceLine = {
  id: string;
  source: "fee" | "invoice" | "manual" | "recurring" | "payout" | "commission";
  kind: "income" | "expense";
  category: string;
  description: string;
  amountCents: number;
  currency: string;
  date: string; // YYYY-MM-DD
  status: "paid" | "due";
  recurringId: string | null;
  hasReceipt: boolean;
  /** Received from / paid to. */
  party: string | null;
  /** Where the receipt opens, when there is one. */
  receiptHref: string | null;
  /** An expense the profit-sharing partners carry too (false: SnZ Ventures' own, e.g. office rent). */
  partnerCost: boolean;
};

export type Recurring = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  currency: string;
  dayOfMonth: number;
  autoPaid: boolean;
  active: boolean;
  startsOn: string;
  notes: string | null;
  hasBill: boolean;
  /** Counts against the profit the partners share (false: SnZ Ventures carries it alone). */
  partnerCost: boolean;
};

const day = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/** First day of the month, as YYYY-MM-01. */
export const monthStart = (ym: string) => `${ym}-01`;

/**
 * Writes each active fixed cost into every month from its start to now,
 * once (the unique index makes repeats a no-op), and marks auto-paid ones
 * paid once their day has come.
 */
export async function materializeRecurring(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    const sql = db();
    await sql`
      INSERT INTO finance_entries
        (kind, category, description, amount_cents, currency, occurred_on, status, recurring_id, recurring_month, created_by)
      SELECT 'expense', r.category, r.name, r.amount_cents, r.currency,
             (m::date + (r.day_of_month - 1)),
             CASE WHEN r.auto_paid AND (m::date + (r.day_of_month - 1)) <= current_date THEN 'paid' ELSE 'due' END,
             r.id, m::date, r.created_by
        FROM finance_recurring r,
             generate_series(date_trunc('month', r.starts_on), date_trunc('month', current_date), interval '1 month') AS m
       WHERE r.active
      ON CONFLICT (recurring_id, recurring_month) WHERE recurring_id IS NOT NULL DO NOTHING`;
    await sql`
      UPDATE finance_entries e SET status = 'paid', updated_at = now()
        FROM finance_recurring r
       WHERE e.recurring_id = r.id AND r.auto_paid AND e.status = 'due' AND e.occurred_on <= current_date`;
    return true;
  }, false);
}

/** Every income and expense line between two dates (inclusive). */
export async function linesBetween(from: string, to: string): Promise<FinanceLine[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT f.id::text AS id, 'fee' AS source, 'income' AS kind, 'Student fees' AS category,
             concat(f.fee_type, ', ', f.university) AS description,
             round(f.amount * 100)::bigint AS amount_cents, f.currency,
             COALESCE(f.reviewed_at, f.updated_at)::date AS date, 'paid' AS status,
             NULL::uuid AS recurring_id, (f.receipt_document_id IS NOT NULL) AS has_receipt,
             u.name AS party, f.receipt_document_id::text AS receipt_doc, TRUE AS partner_cost
        FROM fee_submissions f JOIN users u ON u.id = f.user_id
       WHERE f.status = 'verified' AND COALESCE(f.reviewed_at, f.updated_at)::date BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT i.id::text, 'invoice', 'income', 'Invoices', i.number,
             i.total_cents, i.currency, i.updated_at::date, 'paid', NULL::uuid, FALSE, i.bill_to_name, NULL, TRUE
        FROM invoices i
       WHERE i.status = 'paid' AND i.updated_at::date BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT e.id::text,
             CASE WHEN e.recurring_id IS NOT NULL THEN 'recurring'
                  WHEN EXISTS (SELECT 1 FROM finance_payouts p WHERE p.entry_id = e.id) THEN 'payout'
                  WHEN EXISTS (SELECT 1 FROM finance_commissions c WHERE c.entry_id = e.id) THEN 'commission'
                  ELSE 'manual' END,
             e.kind, e.category,
             e.description, e.amount_cents, e.currency, e.occurred_on, e.status, e.recurring_id,
             (e.receipt_key IS NOT NULL), e.party, NULL, COALESCE(fr.partner_cost, e.partner_cost)
        FROM finance_entries e LEFT JOIN finance_recurring fr ON fr.id = e.recurring_id
       WHERE e.occurred_on BETWEEN ${from} AND ${to}
      ORDER BY date DESC
    `;
    return rows.map((r) => ({
      id: String(r.id),
      source: r.source as FinanceLine["source"],
      kind: r.kind as FinanceLine["kind"],
      category: String(r.category),
      description: String(r.description),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      date: day(r.date),
      status: r.status === "due" ? "due" : "paid",
      recurringId: r.recurring_id ? String(r.recurring_id) : null,
      hasReceipt: r.has_receipt === true,
      party: r.party ? String(r.party) : null,
      receiptHref:
        r.source === "fee"
          ? r.receipt_doc
            ? `/api/portal/documents/${r.receipt_doc}`
            : null
          : r.has_receipt === true
            ? `/api/admin/finance/receipt/${r.id}`
            : null,
      partnerCost: r.partner_cost !== false,
    }));
  }, []);
}

/** Fee receipts students sent that are not verified yet: money on its way. */
export async function pendingFees(): Promise<
  { id: string; student: string; amountCents: number; currency: string; sentOn: string; receiptHref: string | null }[]
> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT f.id, u.name, round(f.amount * 100)::bigint AS amount_cents, f.currency, f.created_at, f.receipt_document_id
        FROM fee_submissions f JOIN users u ON u.id = f.user_id
       WHERE f.status = 'submitted' ORDER BY f.created_at`;
    return rows.map((r) => ({
      id: String(r.id),
      student: String(r.name),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      sentOn: day(r.created_at),
      receiptHref: r.receipt_document_id ? `/api/portal/documents/${r.receipt_document_id}` : null,
    }));
  }, []);
}

/* ---------------------------------------------------------- rates */

/**
 * Exchange rates: units of a currency per euro. Month rows (finance_rates) and
 * day rows (finance_rates_daily, `day` set). See `rateFor` for which one a
 * date uses.
 */
export type Rate = { month: string; currency: string; perEur: number; source: "manual" | "auto"; updatedAt: string; day?: string };
export type Rates = Rate[];

/** The currencies kept up to date by themselves. */
export const AUTO_CURRENCIES = ["PKR", "USD", "GBP"] as const;

async function ratesFrom(url: string, pick: (data: unknown) => Record<string, number> | null): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return pick(await res.json());
  } catch {
    return null;
  }
}
const pickEur = (data: unknown) => {
  const eur = (data as { eur?: Record<string, number> }).eur;
  return eur ? Object.fromEntries(Object.entries(eur).map(([k, v]) => [k.toUpperCase(), v])) : null;
};

/** Today's market rates (units per euro), from a free exchange-rate service, with a second one if the first fails. */
async function fetchTodaysRates(): Promise<Record<string, number> | null> {
  return (
    (await ratesFrom("https://open.er-api.com/v6/latest/EUR", (d) => {
      const x = d as { result?: string; rates?: Record<string, number> };
      return x.result === "success" && x.rates ? x.rates : null;
    })) ?? (await ratesFrom("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json", pickEur))
  );
}

/** The market rates of a past day (YYYY-MM-DD). */
async function fetchRatesOn(day: string): Promise<Record<string, number> | null> {
  return (
    (await ratesFrom(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/eur.json`, pickEur)) ??
    (await ratesFrom(`https://${day}.currency-api.pages.dev/v1/currencies/eur.json`, pickEur))
  );
}

async function writeDay(on: string, rates: Record<string, number>) {
  for (const c of AUTO_CURRENCIES) {
    const v = Number(rates[c]);
    if (!Number.isFinite(v) || v <= 0) continue;
    await db()`
      INSERT INTO finance_rates_daily (day, currency, per_eur) VALUES (${on}, ${c}, ${v})
      ON CONFLICT (day, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur, updated_at = now()`;
  }
}

// Checked at most every half hour per server, so a busy page does not hit the database for it each time.
let lastCheck = 0;

/**
 * Keeps the rates current, by itself:
 *  - today's rate of each currency is fetched when missing or more than twelve
 *    hours old, and kept as today's day rate (and as this month's latest);
 *  - any past day with an amount in a foreign currency but no day rate yet
 *    gets that day's rate (a few days per check, newest first).
 * A month rate typed in by the super admin ('manual') is never overwritten.
 * Failure is silent: the rates already stored keep being used.
 */
export async function refreshRatesIfStale(force = false): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!force && Date.now() - lastCheck < 30 * 60_000) return;
  lastCheck = Date.now();
  await safeQuery(async () => {
    const sql = db();
    const today = await sql`SELECT currency, updated_at FROM finance_rates_daily WHERE day = current_date`;
    const stale = AUTO_CURRENCIES.some((c) => {
      const r = today.find((x) => x.currency === c);
      return !r || Date.now() - new Date(r.updated_at as string).getTime() > 12 * 60 * 60_000;
    });
    if (stale) {
      const rates = await fetchTodaysRates();
      if (rates) {
        const [{ d }] = await sql`SELECT current_date::text AS d`;
        await writeDay(String(d), rates);
        for (const c of AUTO_CURRENCIES) {
          const v = Number(rates[c]);
          if (!Number.isFinite(v) || v <= 0) continue;
          await sql`
            INSERT INTO finance_rates (month, currency, per_eur, source)
            VALUES (date_trunc('month', current_date)::date, ${c}, ${v}, 'auto')
            ON CONFLICT (month, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur, updated_at = now()
             WHERE finance_rates.source = 'auto'`;
        }
      }
    }
    // Past days that have foreign-currency amounts but no rate of their own yet.
    const missing = await sql`
      SELECT DISTINCT x.d::text AS day FROM (
        SELECT occurred_on AS d, currency FROM finance_entries
        UNION ALL SELECT COALESCE(reviewed_at, updated_at)::date, currency FROM fee_submissions WHERE status = 'verified'
        UNION ALL SELECT updated_at::date, currency FROM invoices WHERE status = 'paid'
      ) x
       WHERE x.currency = ANY(${[...AUTO_CURRENCIES]}) AND x.d < current_date AND x.d >= current_date - 730
         AND NOT EXISTS (SELECT 1 FROM finance_rates_daily r WHERE r.day = x.d AND r.currency = x.currency)
       ORDER BY 1 DESC LIMIT 6`;
    for (const m of missing) {
      const rates = await fetchRatesOn(String(m.day));
      if (rates) await writeDay(String(m.day), rates);
    }
    return true;
  }, false);
}

export async function allRates(): Promise<Rates> {
  if (!isDatabaseConfigured()) return [];
  await refreshRatesIfStale();
  return safeQuery(async () => {
    const [months, days] = await Promise.all([
      db()`SELECT month, currency, per_eur, source, updated_at FROM finance_rates ORDER BY month DESC`,
      db()`SELECT day, currency, per_eur, updated_at FROM finance_rates_daily ORDER BY day DESC`,
    ]);
    return [
      ...months.map((r) => ({
        month: day(r.month),
        currency: String(r.currency),
        perEur: Number(r.per_eur),
        source: (r.source === "auto" ? "auto" : "manual") as Rate["source"],
        updatedAt: new Date(r.updated_at as string).toISOString(),
      })),
      ...days.map((r) => ({
        month: `${day(r.day).slice(0, 7)}-01`,
        currency: String(r.currency),
        perEur: Number(r.per_eur),
        source: "auto" as const,
        updatedAt: new Date(r.updated_at as string).toISOString(),
        day: day(r.day),
      })),
    ];
  }, []);
}

/** A month's own rate row (not a day row), for the Rates panel. */
export const monthRate = (rates: Rates, currency: string, ym: string) =>
  rates.find((r) => !r.day && r.currency === currency && r.month === `${ym}-01`) ?? null;

/** The latest day rate of a currency: "today's rate". */
export const latestDayRate = (rates: Rates, currency: string) => rates.find((r) => r.day && r.currency === currency) ?? null;

/** Drop a typed-in rate so the month goes back to the automatic one. */
export async function clearManualRate(month: string, currency: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const ok = await safeQuery(async () => {
    await db()`DELETE FROM finance_rates WHERE month = ${month} AND currency = ${currency} AND source = 'manual'`;
    return true;
  }, false);
  await refreshRatesIfStale(true);
  return ok;
}

/**
 * How many units of `currency` make one euro on `date`:
 *  1. a rate the super admin fixed for that month, if any;
 *  2. else that day's market rate, or the nearest earlier day's;
 *  3. else that month's rate, or the latest earlier month's;
 *  4. else the oldest rate known.
 * Null when none has ever been set.
 */
export function rateFor(rates: Rates, currency: string, date: string): number | null {
  if (currency === "EUR") return 1;
  const d = date.slice(0, 10);
  const m = `${d.slice(0, 7)}-01`;
  const mine = rates.filter((r) => r.currency === currency);
  const fixed = mine.find((r) => !r.day && r.source === "manual" && r.month === m);
  if (fixed) return fixed.perEur;
  const days = mine.filter((r) => r.day);
  const onDay = days.find((r) => (r.day as string) <= d);
  if (onDay) return onDay.perEur;
  const months = mine.filter((r) => !r.day);
  return (months.find((r) => r.month <= m) ?? days[days.length - 1] ?? months[months.length - 1])?.perEur ?? null;
}

/** A line's amount in euro cents, or null when its currency has no rate. */
export function inEur(line: { amountCents: number; currency: string; date: string }, rates: Rates): number | null {
  const r = rateFor(rates, line.currency, line.date);
  return r ? Math.round(line.amountCents / r) : null;
}

export async function setRate(month: string, currency: string, perEur: number): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO finance_rates (month, currency, per_eur, source) VALUES (${month}, ${currency}, ${perEur}, 'manual')
      ON CONFLICT (month, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur, source = 'manual', updated_at = now()`;
    return true;
  }, false);
}

/* -------------------------------------------------------- entries */

export async function addEntry(e: {
  kind: "income" | "expense";
  category: string;
  description: string;
  party?: string | null;
  studentId?: string | null;
  consultantId?: string | null;
  university?: string | null;
  amountCents: number;
  currency: string;
  occurredOn: string;
  status: "paid" | "due";
  receipt: { key: string; name: string; type: string; provider: string } | null;
  createdBy: string;
  /** An expense the profit-sharing partners carry too (default yes). */
  partnerCost?: boolean;
}): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      INSERT INTO finance_entries (kind, category, description, amount_cents, currency, occurred_on, status,
                                   receipt_key, receipt_name, receipt_type, receipt_provider, created_by,
                                   party, student_id, consultant_id, university, partner_cost)
      VALUES (${e.kind}, ${e.category}, ${e.description}, ${e.amountCents}, ${e.currency}, ${e.occurredOn}, ${e.status},
              ${e.receipt?.key ?? null}, ${e.receipt?.name ?? null}, ${e.receipt?.type ?? null}, ${e.receipt?.provider ?? null},
              ${e.createdBy}, ${e.party ?? null}, ${e.studentId ?? null}, ${e.consultantId ?? null}, ${e.university ?? null},
              ${e.partnerCost ?? true})
      RETURNING id`;
    return String(r.id);
  }, null);
}

export async function getEntry(id: string) {
  if (!isDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeQuery(async () => {
    const [r] = await db()`SELECT * FROM finance_entries WHERE id = ${id}`;
    return r
      ? {
          id: String(r.id),
          recurringId: r.recurring_id ? String(r.recurring_id) : null,
          receiptKey: r.receipt_key ? String(r.receipt_key) : null,
          receiptName: r.receipt_name ? String(r.receipt_name) : null,
          receiptProvider: r.receipt_provider ? String(r.receipt_provider) : null,
        }
      : null;
  }, null);
}

export async function setEntryStatus(id: string, status: "paid" | "due"): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`UPDATE finance_entries SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** A typed-in entry. A fixed cost's month is not deleted (it would come back): stop the fixed cost instead. */
export async function deleteEntry(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      DELETE FROM finance_entries e WHERE e.id = ${id} AND e.recurring_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM finance_payouts p WHERE p.entry_id = e.id)
         AND NOT EXISTS (SELECT 1 FROM finance_commissions c WHERE c.entry_id = e.id)
      RETURNING id`;
    return rows.length > 0;
  }, false);
}

/* ------------------------------------------------------ fixed costs */

export async function listRecurring(): Promise<Recurring[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`SELECT * FROM finance_recurring ORDER BY active DESC, name`;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      category: String(r.category),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      dayOfMonth: Number(r.day_of_month),
      autoPaid: r.auto_paid === true,
      active: r.active === true,
      startsOn: day(r.starts_on),
      notes: r.notes ? String(r.notes) : null,
      hasBill: r.receipt_key != null,
      partnerCost: r.partner_cost !== false,
    }));
  }, []);
}

type Bill = { key: string; name: string; type: string; provider: string };

export async function addRecurring(r: Omit<Recurring, "id" | "active" | "hasBill"> & { createdBy: string; bill?: Bill | null }): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO finance_recurring (name, category, amount_cents, currency, day_of_month, auto_paid, starts_on, notes, created_by,
                                     receipt_key, receipt_name, receipt_type, receipt_provider, partner_cost)
      VALUES (${r.name}, ${r.category}, ${r.amountCents}, ${r.currency}, ${r.dayOfMonth}, ${r.autoPaid}, ${r.startsOn}, ${r.notes}, ${r.createdBy},
              ${r.bill?.key ?? null}, ${r.bill?.name ?? null}, ${r.bill?.type ?? null}, ${r.bill?.provider ?? null}, ${r.partnerCost})`;
    return true;
  }, false);
}

/**
 * Change a fixed cost. New amounts apply to months not yet written; months
 * already written keep what they said. Switching one back on starts it from
 * this month, so the months it was off are not filled in behind you.
 */
export async function updateRecurring(
  id: string,
  p: {
    name?: string;
    category?: string;
    amountCents?: number;
    currency?: string;
    dayOfMonth?: number;
    autoPaid?: boolean;
    active?: boolean;
    partnerCost?: boolean;
  }
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE finance_recurring SET
        name = COALESCE(${p.name ?? null}, name),
        category = COALESCE(${p.category ?? null}, category),
        amount_cents = COALESCE(${p.amountCents ?? null}::bigint, amount_cents),
        currency = COALESCE(${p.currency ?? null}, currency),
        day_of_month = COALESCE(${p.dayOfMonth ?? null}::smallint, day_of_month),
        auto_paid = COALESCE(${p.autoPaid ?? null}::boolean, auto_paid),
        partner_cost = COALESCE(${p.partnerCost ?? null}::boolean, partner_cost),
        starts_on = CASE WHEN ${p.active === true} AND NOT active THEN date_trunc('month', current_date)::date ELSE starts_on END,
        active = COALESCE(${p.active ?? null}::boolean, active),
        updated_at = now()
       WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** Delete a fixed cost. The months it already wrote stay in the books. */
export async function deleteRecurring(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`DELETE FROM finance_recurring WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/* ------------------------------------------------------- people lists */

export async function studentsForPicker(): Promise<{ id: string; name: string }[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`SELECT id, name FROM users WHERE role IN ('student', 'professional', 'business') ORDER BY name LIMIT 2000`;
    return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  }, []);
}

/* ------------------------------------------------- consultant shares */

export type ConsultantTerms = { consultantId: string; kind: "percent" | "fixed"; value: number; currency: string; startsOn: string };

export type ConsultantSummary = {
  id: string;
  name: string;
  email: string;
  code: string | null;
  students: number;
  terms: ConsultantTerms | null;
};

export async function consultantsForFinance(): Promise<ConsultantSummary[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT u.id, u.name, u.email, u.consultant_code,
             (SELECT count(*)::int FROM staff_assignments sa WHERE sa.advisor_id = u.id) AS students,
             t.kind, t.value, t.currency AS t_currency, t.starts_on
        FROM users u LEFT JOIN finance_consultant_terms t ON t.consultant_id = u.id
       WHERE u.role = 'advisor'
       ORDER BY u.name`;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      code: r.consultant_code ? String(r.consultant_code) : null,
      students: Number(r.students),
      terms: r.kind
        ? { consultantId: String(r.id), kind: r.kind as "percent" | "fixed", value: Number(r.value), currency: String(r.t_currency), startsOn: day(r.starts_on) }
        : null,
    }));
  }, []);
}

export type ConsultantStudent = { id: string; name: string; feeCents: number | null; feeCurrency: string | null };

/** Each consultant's students, with the amount of the student's latest verified fee (for a percentage share). */
export async function studentsByConsultant(): Promise<Record<string, ConsultantStudent[]>> {
  if (!isDatabaseConfigured()) return {};
  return safeQuery(async () => {
    const rows = await db()`
      SELECT sa.advisor_id, s.id, s.name, f.amount, f.currency
        FROM staff_assignments sa
        JOIN users a ON a.id = sa.advisor_id AND a.role = 'advisor'
        JOIN users s ON s.id = sa.client_id
        LEFT JOIN LATERAL (
          SELECT amount, currency FROM fee_submissions
           WHERE user_id = s.id AND status = 'verified' ORDER BY COALESCE(reviewed_at, updated_at) DESC LIMIT 1
        ) f ON TRUE
       ORDER BY s.name`;
    const out: Record<string, ConsultantStudent[]> = {};
    for (const r of rows) {
      (out[String(r.advisor_id)] ??= []).push({
        id: String(r.id),
        name: String(r.name),
        feeCents: r.amount == null ? null : Math.round(Number(r.amount) * 100),
        feeCurrency: r.currency ? String(r.currency) : null,
      });
    }
    return out;
  }, {});
}

export async function setTerms(t: ConsultantTerms | { consultantId: string; remove: true }): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    if ("remove" in t) {
      await db()`DELETE FROM finance_consultant_terms WHERE consultant_id = ${t.consultantId}`;
      return true;
    }
    await db()`
      INSERT INTO finance_consultant_terms (consultant_id, kind, value, currency, starts_on)
      VALUES (${t.consultantId}, ${t.kind}, ${t.value}, ${t.currency}, ${t.startsOn})
      ON CONFLICT (consultant_id) DO UPDATE SET kind = EXCLUDED.kind, value = EXCLUDED.value,
        currency = EXCLUDED.currency, starts_on = EXCLUDED.starts_on, updated_at = now()`;
    return true;
  }, false);
}

/**
 * For every fee verified on or after a consultant's terms began, for one of
 * their students, the consultant's share is written as owed, once per fee.
 * A percentage is of the fee in the fee's currency; a fixed share is in the
 * terms' own currency.
 */
export async function materializePayouts(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    await db()`
      INSERT INTO finance_payouts (consultant_id, student_id, fee_id, description, amount_cents, currency, status, created_on,
                                   rule_kind, rule_value, base_cents)
      SELECT t.consultant_id, f.user_id, f.id,
             concat('Share of ', lower(f.fee_type), ': ', u.name),
             CASE WHEN t.kind = 'percent' THEN round(f.amount * t.value)::bigint ELSE round(t.value * 100)::bigint END,
             CASE WHEN t.kind = 'percent' THEN f.currency ELSE t.currency END,
             'owed', COALESCE(f.reviewed_at, f.updated_at)::date,
             t.kind, t.value, round(f.amount * 100)::bigint
        FROM fee_submissions f
        JOIN users u ON u.id = f.user_id
        JOIN LATERAL (
          SELECT sa.advisor_id FROM staff_assignments sa JOIN users a ON a.id = sa.advisor_id
           WHERE sa.client_id = f.user_id AND a.role = 'advisor' ORDER BY sa.created_at LIMIT 1
        ) adv ON TRUE
        JOIN finance_consultant_terms t ON t.consultant_id = adv.advisor_id
       WHERE f.status = 'verified' AND COALESCE(f.reviewed_at, f.updated_at)::date >= t.starts_on
      ON CONFLICT (fee_id) WHERE fee_id IS NOT NULL DO NOTHING`;
    return true;
  }, false);
}

export type Payout = {
  id: string;
  /** A consultant on the portal, or anyone else who referred a student. */
  referrerKind: "consultant" | "referral";
  consultantId: string | null;
  /** The consultant's name, or the referrer's name as typed. */
  consultantName: string;
  studentName: string | null;
  description: string;
  amountCents: number;
  currency: string;
  status: "owed" | "paid";
  createdOn: string;
  paidOn: string | null;
  automatic: boolean;
  /** The share rule it was worked out with, when known. */
  ruleKind: "percent" | "fixed" | null;
  ruleValue: number | null;
  baseCents: number | null;
};

export async function listPayouts(): Promise<Payout[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT p.*, COALESCE(c.name, p.referrer_name) AS consultant_name, COALESCE(s.name, p.student_name) AS student_label
        FROM finance_payouts p LEFT JOIN users c ON c.id = p.consultant_id LEFT JOIN users s ON s.id = p.student_id
       ORDER BY (p.status = 'paid'), p.created_on DESC, p.created_at DESC LIMIT 1000`;
    return rows.map((r) => ({
      id: String(r.id),
      referrerKind: r.referrer_kind === "referral" ? "referral" : "consultant",
      consultantId: r.consultant_id ? String(r.consultant_id) : null,
      consultantName: String(r.consultant_name ?? "—"),
      studentName: r.student_label ? String(r.student_label) : null,
      description: String(r.description),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      status: r.status === "paid" ? "paid" : "owed",
      createdOn: day(r.created_on),
      paidOn: r.paid_on ? day(r.paid_on) : null,
      automatic: r.fee_id != null,
      ruleKind: r.rule_kind === "percent" || r.rule_kind === "fixed" ? r.rule_kind : null,
      ruleValue: r.rule_value == null ? null : Number(r.rule_value),
      baseCents: r.base_cents == null ? null : Number(r.base_cents),
    }));
  }, []);
}

/**
 * A referral added by hand: for a consultant (their student chosen from the
 * portal) or for anyone else (their name and the student's name typed in).
 */
export async function addPayout(p: {
  referrerKind: "consultant" | "referral";
  consultantId: string | null;
  referrerName: string | null;
  studentId: string | null;
  studentName: string | null;
  description: string;
  amountCents: number;
  currency: string;
  createdOn: string;
  ruleKind: "percent" | "fixed";
  ruleValue: number;
  baseCents: number | null;
  createdBy: string;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO finance_payouts (referrer_kind, consultant_id, referrer_name, student_id, student_name, description,
                                   amount_cents, currency, created_on, rule_kind, rule_value, base_cents, created_by)
      VALUES (${p.referrerKind}, ${p.consultantId}, ${p.referrerName}, ${p.studentId}, ${p.studentName}, ${p.description},
              ${p.amountCents}, ${p.currency}, ${p.createdOn}, ${p.ruleKind}, ${p.ruleValue}, ${p.baseCents}, ${p.createdBy})`;
    return true;
  }, false);
}

/** Paying a consultant writes the expense; un-paying takes it back out. */
export async function setPayoutPaid(id: string, paid: boolean, on: string, by: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      const [p] = await sql`
        SELECT p.*, COALESCE(c.name, p.referrer_name) AS consultant_name
          FROM finance_payouts p LEFT JOIN users c ON c.id = p.consultant_id
         WHERE p.id = ${id} FOR UPDATE OF p`;
      if (!p) return false;
      if (paid && p.status === "owed") {
        const [e] = await sql`
          INSERT INTO finance_entries (kind, category, description, amount_cents, currency, occurred_on, status,
                                       party, student_id, consultant_id, created_by)
          VALUES ('expense', 'Commission', ${p.description}, ${p.amount_cents}, ${p.currency}, ${on}, 'paid',
                  ${p.consultant_name}, ${p.student_id}, ${p.consultant_id}, ${by})
          RETURNING id`;
        await sql`UPDATE finance_payouts SET status = 'paid', paid_on = ${on}, entry_id = ${e.id} WHERE id = ${id}`;
      } else if (!paid && p.status === "paid") {
        if (p.entry_id) await sql`DELETE FROM finance_entries WHERE id = ${p.entry_id}`;
        await sql`UPDATE finance_payouts SET status = 'owed', paid_on = NULL, entry_id = NULL WHERE id = ${id}`;
      }
      return true;
    });
  }, false);
}

/** Only an owed one; a paid one is un-paid first. */
export async function deletePayout(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`DELETE FROM finance_payouts WHERE id = ${id} AND status = 'owed' RETURNING id`;
    return rows.length > 0;
  }, false);
}

/* --------------------------------------------- university commissions */

export type University = {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number | null;
  currency: string;
  notes: string | null;
};

export type Commission = {
  id: string;
  universityId: string;
  university: string;
  studentName: string;
  intake: string | null;
  amountCents: number;
  currency: string;
  expectedOn: string | null;
  status: "expected" | "received";
  receivedOn: string | null;
};

export async function listUniversities(): Promise<University[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`SELECT * FROM finance_universities ORDER BY name`;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: r.kind === "percent" ? "percent" : "fixed",
      value: r.value == null ? null : Number(r.value),
      currency: String(r.currency),
      notes: r.notes ? String(r.notes) : null,
    }));
  }, []);
}

export async function addUniversity(u: Omit<University, "id">): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO finance_universities (name, kind, value, currency, notes)
      VALUES (${u.name}, ${u.kind}, ${u.value}, ${u.currency}, ${u.notes})`;
    return true;
  }, false);
}

/**
 * The university of that name (any case), or a new one. A commission rule
 * given with a new university is kept with it, to fill the next one in.
 */
export async function universityByName(
  name: string,
  rule?: { kind: "percent" | "fixed"; value: number | null; currency: string }
): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [found] = await db()`SELECT id FROM finance_universities WHERE lower(name) = lower(${name}) LIMIT 1`;
    if (found) return String(found.id);
    const [made] = await db()`
      INSERT INTO finance_universities (name, kind, value, currency)
      VALUES (${name}, ${rule?.kind ?? "fixed"}, ${rule?.value ?? null}, ${rule?.currency ?? "EUR"})
      RETURNING id`;
    return String(made.id);
  }, null);
}

export async function deleteUniversity(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      DELETE FROM finance_universities WHERE id = ${id}
         AND NOT EXISTS (SELECT 1 FROM finance_commissions WHERE university_id = ${id} AND status = 'received')
      RETURNING id`;
    return rows.length > 0;
  }, false);
}

export async function listCommissions(): Promise<Commission[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.*, u.name AS university FROM finance_commissions c JOIN finance_universities u ON u.id = c.university_id
       ORDER BY (c.status = 'received'), c.expected_on NULLS LAST, c.created_at DESC LIMIT 2000`;
    return rows.map((r) => ({
      id: String(r.id),
      universityId: String(r.university_id),
      university: String(r.university),
      studentName: String(r.student_name),
      intake: r.intake ? String(r.intake) : null,
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      expectedOn: r.expected_on ? day(r.expected_on) : null,
      status: r.status === "received" ? "received" : "expected",
      receivedOn: r.received_on ? day(r.received_on) : null,
    }));
  }, []);
}

export async function addCommission(c: {
  universityId: string;
  studentId: string | null;
  studentName: string;
  intake: string | null;
  amountCents: number;
  currency: string;
  expectedOn: string | null;
  createdBy: string;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO finance_commissions (university_id, student_id, student_name, intake, amount_cents, currency, expected_on, created_by)
      VALUES (${c.universityId}, ${c.studentId}, ${c.studentName}, ${c.intake}, ${c.amountCents}, ${c.currency}, ${c.expectedOn}, ${c.createdBy})`;
    return true;
  }, false);
}

/** Receiving a commission writes the income; un-marking takes it back out. */
export async function setCommissionReceived(id: string, received: boolean, on: string, by: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      const [c] = await sql`
        SELECT c.*, u.name AS university FROM finance_commissions c JOIN finance_universities u ON u.id = c.university_id
         WHERE c.id = ${id} FOR UPDATE OF c`;
      if (!c) return false;
      if (received && c.status === "expected") {
        const [e] = await sql`
          INSERT INTO finance_entries (kind, category, description, amount_cents, currency, occurred_on, status,
                                       party, student_id, university, created_by)
          VALUES ('income', 'University commission', ${`Commission for ${c.student_name}`}, ${c.amount_cents}, ${c.currency},
                  ${on}, 'paid', ${c.university}, ${c.student_id}, ${c.university}, ${by})
          RETURNING id`;
        await sql`UPDATE finance_commissions SET status = 'received', received_on = ${on}, entry_id = ${e.id} WHERE id = ${id}`;
      } else if (!received && c.status === "received") {
        if (c.entry_id) await sql`DELETE FROM finance_entries WHERE id = ${c.entry_id}`;
        await sql`UPDATE finance_commissions SET status = 'expected', received_on = NULL, entry_id = NULL WHERE id = ${id}`;
      }
      return true;
    });
  }, false);
}

export async function deleteCommission(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`DELETE FROM finance_commissions WHERE id = ${id} AND status = 'expected' RETURNING id`;
    return rows.length > 0;
  }, false);
}

/* ------------------------------------------------------- stakeholders */

export type Stakeholder = {
  id: string;
  name: string;
  sharePct: number;
  isCompany: boolean;
  active: boolean;
  notes: string | null;
};

export type Distribution = {
  id: string;
  stakeholderId: string;
  month: string; // YYYY-MM
  amountCents: number;
  currency: string;
  paidOn: string;
};

export async function listStakeholders(): Promise<Stakeholder[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`SELECT * FROM finance_stakeholders ORDER BY active DESC, is_company DESC, share_pct DESC, name`;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      sharePct: Number(r.share_pct),
      isCompany: r.is_company === true,
      active: r.active === true,
      notes: r.notes ? String(r.notes) : null,
    }));
  }, []);
}

export async function saveStakeholder(s: { id?: string; name: string; sharePct: number; isCompany: boolean; notes: string | null }): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    if (s.id) {
      const rows = await db()`
        UPDATE finance_stakeholders SET name = ${s.name}, share_pct = ${s.sharePct}, is_company = ${s.isCompany}, notes = ${s.notes}
         WHERE id = ${s.id} RETURNING id`;
      return rows.length > 0;
    }
    await db()`
      INSERT INTO finance_stakeholders (name, share_pct, is_company, notes)
      VALUES (${s.name}, ${s.sharePct}, ${s.isCompany}, ${s.notes})`;
    return true;
  }, false);
}

export async function setStakeholderActive(id: string, active: boolean): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`UPDATE finance_stakeholders SET active = ${active} WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** Only one who was never paid; otherwise switch them off, so their history stays. */
export async function deleteStakeholder(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      DELETE FROM finance_stakeholders WHERE id = ${id}
         AND NOT EXISTS (SELECT 1 FROM finance_distributions d WHERE d.stakeholder_id = ${id})
      RETURNING id`;
    return rows.length > 0;
  }, false);
}

export async function listDistributions(fromMonth: string, toMonth: string): Promise<Distribution[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT * FROM finance_distributions
       WHERE month BETWEEN ${`${fromMonth}-01`} AND ${`${toMonth}-01`}
       ORDER BY month DESC`;
    return rows.map((r) => ({
      id: String(r.id),
      stakeholderId: String(r.stakeholder_id),
      month: day(r.month).slice(0, 7),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      paidOn: day(r.paid_on),
    }));
  }, []);
}

/** Record that a stakeholder was paid their share of a month: the amount is fixed from then on. */
export async function recordDistribution(d: { stakeholderId: string; month: string; amountCents: number; paidOn: string; by: string }): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO finance_distributions (stakeholder_id, month, amount_cents, paid_on, created_by)
      VALUES (${d.stakeholderId}, ${`${d.month}-01`}, ${d.amountCents}, ${d.paidOn}, ${d.by})
      ON CONFLICT (stakeholder_id, month) DO UPDATE SET amount_cents = EXCLUDED.amount_cents, paid_on = EXCLUDED.paid_on`;
    return true;
  }, false);
}

export async function undoDistribution(stakeholderId: string, month: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`DELETE FROM finance_distributions WHERE stakeholder_id = ${stakeholderId} AND month = ${`${month}-01`} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/* ------------------------------------------------- editing an entry */

/** Change a typed-in entry (not a fixed cost's month, a consultant share or a commission). */
export async function updateEntry(
  id: string,
  e: {
    category: string;
    description: string;
    party: string | null;
    amountCents: number;
    currency: string;
    occurredOn: string;
    status: "paid" | "due";
    partnerCost: boolean;
  }
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE finance_entries e SET category = ${e.category}, description = ${e.description}, party = ${e.party},
             amount_cents = ${e.amountCents}, currency = ${e.currency}, occurred_on = ${e.occurredOn}, status = ${e.status},
             partner_cost = ${e.partnerCost}, updated_at = now()
       WHERE e.id = ${id} AND e.recurring_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM finance_payouts p WHERE p.entry_id = e.id)
         AND NOT EXISTS (SELECT 1 FROM finance_commissions c WHERE c.entry_id = e.id)
      RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** Receipts of a month, for the accountant's download. */
export async function receiptsBetween(from: string, to: string): Promise<{ name: string; key: string; provider: string | null; date: string; label: string }[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT d.storage_key AS key, d.storage_provider AS provider, d.name, COALESCE(f.reviewed_at, f.updated_at)::date AS date,
             concat('Fee - ', u.name) AS label
        FROM fee_submissions f JOIN documents d ON d.id = f.receipt_document_id JOIN users u ON u.id = f.user_id
       WHERE f.status = 'verified' AND d.storage_key IS NOT NULL
         AND COALESCE(f.reviewed_at, f.updated_at)::date BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT e.receipt_key, e.receipt_provider, e.receipt_name, e.occurred_on,
             concat(CASE WHEN e.kind = 'income' THEN 'Income - ' ELSE 'Expense - ' END, e.description)
        FROM finance_entries e
       WHERE e.receipt_key IS NOT NULL AND e.occurred_on BETWEEN ${from} AND ${to}
      ORDER BY date`;
    return rows.map((r) => ({
      name: String(r.name ?? "receipt"),
      key: String(r.key),
      provider: r.provider ? String(r.provider) : null,
      date: day(r.date),
      label: String(r.label),
    }));
  }, []);
}

/** Attach (or replace) a fixed cost's bill. Returns the old one, to remove from storage. */
export async function setRecurringBill(id: string, bill: Bill): Promise<{ key: string | null; provider: string | null } | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [old] = await db()`SELECT receipt_key, receipt_provider FROM finance_recurring WHERE id = ${id}`;
    if (!old) return null;
    await db()`
      UPDATE finance_recurring SET receipt_key = ${bill.key}, receipt_name = ${bill.name}, receipt_type = ${bill.type},
             receipt_provider = ${bill.provider}, updated_at = now() WHERE id = ${id}`;
    return { key: old.receipt_key ? String(old.receipt_key) : null, provider: old.receipt_provider ? String(old.receipt_provider) : null };
  }, null);
}

export async function getRecurringBill(id: string): Promise<{ key: string; provider: string | null } | null> {
  if (!isDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeQuery(async () => {
    const [r] = await db()`SELECT receipt_key, receipt_provider FROM finance_recurring WHERE id = ${id} AND receipt_key IS NOT NULL`;
    return r ? { key: String(r.receipt_key), provider: r.receipt_provider ? String(r.receipt_provider) : null } : null;
  }, null);
}

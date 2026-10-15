import { db, safeQuery, isDatabaseConfigured } from "../client";
import { addEntry, addTransfer } from "./finance";

/**
 * FINANCE INTEGRATIONS (migration 045): connected bank and payment accounts,
 * and the statement lines they bring in for review. Super admin only; every
 * caller checks that. Tokens are sealed by the caller before they reach here.
 */

export type Provider = "wise" | "stripe" | "revolut" | "csv";

export type Integration = {
  id: string;
  provider: Provider;
  label: string;
  accountId: string | null;
  accountName: string | null;
  accountCurrency: string | null;
  hasSecret: boolean;
  meta: Record<string, unknown>;
  status: "connected" | "error" | "paused";
  lastSyncAt: string | null;
  lastError: string | null;
  providerBalanceCents: number | null;
  providerCurrency: string | null;
  newLines: number;
};

export type BankLine = {
  id: string;
  integrationId: string;
  integrationLabel: string;
  provider: Provider;
  accountId: string | null;
  accountName: string | null;
  externalId: string;
  date: string;
  amountCents: number;
  currency: string;
  description: string;
  counterparty: string | null;
  lineType: string | null;
  status: "new" | "matched" | "added" | "ignored";
  entryId: string | null;
};

export type IncomingLine = {
  externalId: string;
  date: string;
  amountCents: number;
  currency: string;
  description: string;
  counterparty: string | null;
  lineType: string | null;
};

const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function listIntegrations(): Promise<Integration[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT i.*, a.name AS account_name, a.currency AS account_currency,
             (SELECT count(*)::int FROM finance_bank_lines l WHERE l.integration_id = i.id AND l.status = 'new') AS new_lines
        FROM finance_integrations i LEFT JOIN finance_accounts a ON a.id = i.account_id
       ORDER BY i.created_at`;
    return rows.map((r) => ({
      id: String(r.id),
      provider: r.provider as Provider,
      label: String(r.label),
      accountId: r.account_id ? String(r.account_id) : null,
      accountName: r.account_name ? String(r.account_name) : null,
      accountCurrency: r.account_currency ? String(r.account_currency) : null,
      hasSecret: r.secret != null,
      meta: (r.meta ?? {}) as Record<string, unknown>,
      status: r.status === "error" ? "error" : r.status === "paused" ? "paused" : "connected",
      lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at as string).toISOString() : null,
      lastError: r.last_error ? String(r.last_error) : null,
      providerBalanceCents: r.provider_balance_cents == null ? null : Number(r.provider_balance_cents),
      providerCurrency: r.provider_currency ? String(r.provider_currency) : null,
      newLines: Number(r.new_lines),
    }));
  }, []);
}

/** The sealed token and details of one connection, for the server to sync with. */
export async function integrationForSync(id: string): Promise<{ provider: Provider; secret: string | null; meta: Record<string, unknown>; accountId: string | null; currency: string | null; lastSyncAt: string | null } | null> {
  if (!isDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT i.provider, i.secret, i.meta, i.account_id, i.last_sync_at, a.currency
        FROM finance_integrations i LEFT JOIN finance_accounts a ON a.id = i.account_id WHERE i.id = ${id}`;
    return r
      ? {
          provider: r.provider as Provider,
          secret: r.secret ? String(r.secret) : null,
          meta: (r.meta ?? {}) as Record<string, unknown>,
          accountId: r.account_id ? String(r.account_id) : null,
          currency: r.currency ? String(r.currency) : null,
          lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at as string).toISOString() : null,
        }
      : null;
  }, null);
}

export async function createIntegration(i: {
  provider: Provider;
  label: string;
  accountId: string | null;
  sealedSecret: string | null;
  meta: Record<string, unknown>;
  by: string;
}): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      INSERT INTO finance_integrations (provider, label, account_id, secret, meta, created_by)
      VALUES (${i.provider}, ${i.label}, ${i.accountId}, ${i.sealedSecret}, ${db().json(i.meta as never)}, ${i.by})
      RETURNING id`;
    return String(r.id);
  }, null);
}

export async function recordSync(
  id: string,
  s: { ok: boolean; error?: string | null; balanceCents?: number | null; currency?: string | null; meta?: Record<string, unknown> }
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    await db()`
      UPDATE finance_integrations SET
        status = ${s.ok ? "connected" : "error"},
        last_error = ${s.error ?? null},
        last_sync_at = CASE WHEN ${s.ok} THEN now() ELSE last_sync_at END,
        provider_balance_cents = COALESCE(${s.balanceCents ?? null}::bigint, provider_balance_cents),
        provider_currency = COALESCE(${s.currency ?? null}, provider_currency),
        meta = CASE WHEN ${s.meta ? true : false} THEN meta || ${db().json((s.meta ?? {}) as never)} ELSE meta END
       WHERE id = ${id}`;
    return true;
  }, false);
}

export async function setIntegrationAccount(id: string, accountId: string | null, label?: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE finance_integrations SET account_id = ${accountId}, label = COALESCE(${label ?? null}, label) WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** Disconnect: the token is deleted with it; lines already added to the books stay there. */
export async function deleteIntegration(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`DELETE FROM finance_integrations WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** Keeps each statement line once; returns how many were new. */
export async function saveBankLines(integrationId: string, lines: IncomingLine[]): Promise<number> {
  if (!isDatabaseConfigured() || !lines.length) return 0;
  return safeQuery(async () => {
    let added = 0;
    for (const l of lines) {
      const r = await db()`
        INSERT INTO finance_bank_lines (integration_id, external_id, occurred_on, amount_cents, currency, description, counterparty, line_type)
        VALUES (${integrationId}, ${l.externalId}, ${l.date}, ${l.amountCents}, ${l.currency}, ${l.description.slice(0, 300)},
                ${l.counterparty?.slice(0, 160) ?? null}, ${l.lineType?.slice(0, 40) ?? null})
        ON CONFLICT (integration_id, external_id) DO NOTHING RETURNING id`;
      added += r.length;
    }
    return added;
  }, 0);
}

/**
 * RECONCILE: a new statement line is matched to an entry already in the books
 * for the same account, with the same amount, in or out alike, within three
 * days, that no other line has taken.
 */
export async function autoMatch(integrationId: string): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  return safeQuery(async () => {
    const rows = await db()`
      WITH cand AS (
        SELECT DISTINCT ON (l.id) l.id AS line_id, e.id AS entry_id
          FROM finance_bank_lines l
          JOIN finance_integrations i ON i.id = l.integration_id
          JOIN finance_entries e ON e.account_id = i.account_id
                                AND e.amount_cents = abs(l.amount_cents)
                                AND e.currency = l.currency
                                AND e.kind = CASE WHEN l.amount_cents > 0 THEN 'income' ELSE 'expense' END
                                AND abs(e.occurred_on - l.occurred_on) <= 3
         WHERE l.integration_id = ${integrationId} AND l.status = 'new'
           AND NOT EXISTS (SELECT 1 FROM finance_bank_lines x WHERE x.entry_id = e.id)
         ORDER BY l.id, abs(e.occurred_on - l.occurred_on)
      )
      UPDATE finance_bank_lines l SET status = 'matched', entry_id = cand.entry_id
        FROM cand WHERE l.id = cand.line_id RETURNING l.id`;
    return rows.length;
  }, 0);
}

export async function listBankLines(f: { status?: string; integrationId?: string } = {}): Promise<BankLine[]> {
  if (!isDatabaseConfigured()) return [];
  const status = f.status && ["new", "matched", "added", "ignored"].includes(f.status) ? f.status : null;
  const integ = f.integrationId && /^[0-9a-f-]{36}$/i.test(f.integrationId) ? f.integrationId : null;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT l.*, i.label, i.provider, i.account_id, a.name AS account_name
        FROM finance_bank_lines l
        JOIN finance_integrations i ON i.id = l.integration_id
        LEFT JOIN finance_accounts a ON a.id = i.account_id
       WHERE (${status}::text IS NULL OR l.status = ${status})
         AND (${integ}::uuid IS NULL OR l.integration_id = ${integ})
       ORDER BY l.occurred_on DESC, l.created_at DESC LIMIT 500`;
    return rows.map((r) => ({
      id: String(r.id),
      integrationId: String(r.integration_id),
      integrationLabel: String(r.label),
      provider: r.provider as Provider,
      accountId: r.account_id ? String(r.account_id) : null,
      accountName: r.account_name ? String(r.account_name) : null,
      externalId: String(r.external_id),
      date: day(r.occurred_on),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      description: String(r.description ?? ""),
      counterparty: r.counterparty ? String(r.counterparty) : null,
      lineType: r.line_type ? String(r.line_type) : null,
      status: r.status as BankLine["status"],
      entryId: r.entry_id ? String(r.entry_id) : null,
    }));
  }, []);
}

async function getLine(id: string) {
  const [r] = await db()`
    SELECT l.*, i.account_id FROM finance_bank_lines l JOIN finance_integrations i ON i.id = l.integration_id WHERE l.id = ${id}`;
  return r ?? null;
}

/** ADD TO THE BOOKS: a new entry (money in or out) in the connected account, from the statement line. */
export async function addLineAsEntry(id: string, p: { category: string; partnerCost: boolean; vatMode: "none" | "reverse_charge"; by: string }): Promise<boolean> {
  if (!isDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  return safeQuery(async () => {
    const l = await getLine(id);
    if (!l || l.status !== "new") return false;
    const amount = Number(l.amount_cents);
    const kind = amount > 0 ? "income" : "expense";
    const entryId = await addEntry({
      kind,
      category: p.category,
      description: String(l.description || (kind === "income" ? "Money in" : "Money out")),
      party: l.counterparty ? String(l.counterparty) : null,
      amountCents: Math.abs(amount),
      currency: String(l.currency),
      occurredOn: day(l.occurred_on),
      status: "paid",
      receipt: null,
      createdBy: p.by,
      partnerCost: kind === "income" || p.partnerCost,
      accountId: l.account_id ? String(l.account_id) : null,
      vatMode: kind === "expense" ? p.vatMode : "none",
    });
    if (!entryId) return false;
    await db()`UPDATE finance_bank_lines SET status = 'added', entry_id = ${entryId} WHERE id = ${id}`;
    return true;
  }, false);
}

/** A payout or a move between own accounts: a transfer, neither income nor expense. */
export async function addLineAsTransfer(id: string, otherAccountId: string, otherCents: number | null, by: string): Promise<boolean> {
  if (!isDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  return safeQuery(async () => {
    const l = await getLine(id);
    if (!l || l.status !== "new" || !l.account_id) return false;
    const amount = Number(l.amount_cents);
    const mine = String(l.account_id);
    const ok = await addTransfer({
      fromId: amount < 0 ? mine : otherAccountId,
      toId: amount < 0 ? otherAccountId : mine,
      fromCents: amount < 0 ? Math.abs(amount) : otherCents ?? Math.abs(amount),
      toCents: amount < 0 ? otherCents ?? Math.abs(amount) : Math.abs(amount),
      date: day(l.occurred_on),
      note: `${String(l.description || "Transfer")} (from statement)`.slice(0, 200),
      by,
    });
    if (!ok) return false;
    await db()`UPDATE finance_bank_lines SET status = 'added' WHERE id = ${id}`;
    return true;
  }, false);
}

export async function setLineStatus(id: string, status: "new" | "ignored"): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    // Undo of a match or an ignore puts the line back for review; an added entry stays in the books.
    const rows = await db()`
      UPDATE finance_bank_lines SET status = ${status}, entry_id = CASE WHEN ${status} = 'new' AND status = 'matched' THEN NULL ELSE entry_id END
       WHERE id = ${id} AND status IN ('new', 'matched', 'ignored') RETURNING id`;
    return rows.length > 0;
  }, false);
}

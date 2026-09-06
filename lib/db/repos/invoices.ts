import { db, safeQuery } from "../client";
import {
  nextNumber,
  type CurrencyCode,
  type InvoiceStatus,
  type Line,
  type Validated,
} from "@/lib/invoices/model";

/**
 * INVOICE STORAGE.
 * ---------------------------------------------------------------------------
 * Reads go through safeQuery so a half-configured deployment shows an empty
 * list rather than a 500. The WRITE does not: an invoice that silently failed
 * to save would leave somebody looking at a list without the document they
 * just raised, and the next thing they do is raise it again.
 */

export type InvoiceRow = {
  id: string;
  number: string;
  status: InvoiceStatus;
  issuedOn: string;
  dueOn: string | null;
  billToName: string;
  billToEmail: string | null;
  billToAddress: string | null;
  clientId: string | null;
  currency: CurrencyCode;
  vatBp: number;
  lines: Line[];
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const day = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

const map = (r: Record<string, unknown>): InvoiceRow => ({
  id: String(r.id),
  number: String(r.number),
  status: r.status as InvoiceStatus,
  issuedOn: day(r.issued_on)!,
  dueOn: day(r.due_on),
  billToName: String(r.bill_to_name),
  billToEmail: r.bill_to_email ? String(r.bill_to_email) : null,
  billToAddress: r.bill_to_address ? String(r.bill_to_address) : null,
  clientId: r.client_id ? String(r.client_id) : null,
  currency: String(r.currency) as CurrencyCode,
  vatBp: Number(r.vat_bp ?? 0),
  // Stored as {desc, amount_cents}; the wire shape and the app shape differ by
  // one underscore and it is worth converting once, here, rather than in three
  // components that each get it slightly wrong.
  lines: ((r.lines ?? []) as { desc: string; amount_cents: number }[]).map((l) => ({
    desc: String(l.desc ?? ""),
    amountCents: Number(l.amount_cents ?? 0),
  })),
  subtotalCents: Number(r.subtotal_cents ?? 0),
  vatCents: Number(r.vat_cents ?? 0),
  totalCents: Number(r.total_cents ?? 0),
  notes: r.notes ? String(r.notes) : null,
  createdByName: r.created_by_name ? String(r.created_by_name) : null,
  createdAt: iso(r.created_at)!,
});

const COLUMNS = `i.id, i.number, i.status, i.issued_on, i.due_on, i.bill_to_name,
  i.bill_to_email, i.bill_to_address, i.client_id, i.currency, i.vat_bp, i.lines,
  i.subtotal_cents, i.vat_cents, i.total_cents, i.notes, i.created_at,
  u.name AS created_by_name`;

export async function list(
  filter: { status?: InvoiceStatus | "all"; q?: string; limit?: number } = {}
): Promise<{ rows: InvoiceRow[]; totalsByCurrency: { currency: CurrencyCode; cents: number }[] }> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 300);
  const status = filter.status && filter.status !== "all" ? filter.status : null;
  const q = filter.q?.trim() || null;
  const like = q ? `%${q}%` : null;

  return safeQuery(async () => {
    /*
      The list and its totals in ONE round trip. Two queries here would be two
      sequential trips on the single connection a serverless function gets,
      which is the shape that has produced gateway timeouts in this codebase
      more than once.

      Voided invoices are left out of the totals but stay in the list: the
      number must remain visible in sequence, and a cancelled document should
      not be counted as money raised.
    */
    const [r] = await db()`
      SELECT
        COALESCE((SELECT json_agg(x) FROM (
          SELECT ${db().unsafe(COLUMNS)}
            FROM invoices i
            LEFT JOIN users u ON u.id = i.created_by
           WHERE (${status}::text IS NULL OR i.status = ${status})
             AND (${like}::text IS NULL
                  OR i.bill_to_name ILIKE ${like}
                  OR i.number ILIKE ${like}
                  OR i.bill_to_email ILIKE ${like})
           ORDER BY i.issued_on DESC, i.number DESC
           LIMIT ${limit}
        ) x), '[]'::json) AS rows,

        COALESCE((SELECT json_agg(t) FROM (
          SELECT currency, sum(total_cents)::bigint AS cents
            FROM invoices WHERE status <> 'void'
           GROUP BY currency ORDER BY currency
        ) t), '[]'::json) AS totals
    `;

    return {
      rows: ((r?.rows ?? []) as Record<string, unknown>[]).map(map),
      totalsByCurrency: ((r?.totals ?? []) as Record<string, unknown>[]).map((t) => ({
        currency: String(t.currency) as CurrencyCode,
        cents: Number(t.cents ?? 0),
      })),
    };
  }, { rows: [], totalsByCurrency: [] });
}

export async function getById(id: string): Promise<InvoiceRow | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT ${db().unsafe(COLUMNS)}
        FROM invoices i LEFT JOIN users u ON u.id = i.created_by
       WHERE i.id = ${id} LIMIT 1
    `;
    return rows[0] ? map(rows[0]) : null;
  }, null);
}

/** How many numbers this year already exist, so the next one follows on. */
async function numbersThisYear(year: number): Promise<string[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT number FROM invoices WHERE number LIKE ${"SNZ-" + year + "-%"}
    `;
    return rows.map((r) => String(r.number));
  }, []);
}

/**
 * Raises an invoice, claiming its number as it saves.
 *
 * THE RETRY IS THE POINT. The number is worked out from the rows that exist,
 * so two people saving in the same second both compute SNZ-2026-004 — and the
 * unique index lets exactly one of them have it. The loser recomputes and
 * takes 005 instead of failing in front of somebody who has just typed out a
 * whole invoice.
 *
 * Not wrapped in safeQuery: if this cannot save, the person must be told.
 */
export async function create(
  input: Validated & { clientId?: string | null },
  createdBy: string
): Promise<InvoiceRow> {
  const year = Number(input.issuedOn.slice(0, 4));
  const lines = input.lines.map((l) => ({ desc: l.desc, amount_cents: l.amountCents }));

  for (let attempt = 0; attempt < 5; attempt++) {
    const number = nextNumber(year, await numbersThisYear(year));
    try {
      const [row] = await db()`
        INSERT INTO invoices (
          number, status, issued_on, due_on, bill_to_name, bill_to_email,
          bill_to_address, client_id, currency, vat_bp, lines,
          subtotal_cents, vat_cents, total_cents, notes, created_by
        ) VALUES (
          ${number}, 'draft', ${input.issuedOn}, ${input.dueOn},
          ${input.billToName}, ${input.billToEmail}, ${input.billToAddress},
          ${input.clientId ?? null}, ${input.currency}, ${input.vatBp},
          ${JSON.stringify(lines)}::jsonb,
          ${input.subtotalCents}, ${input.vatCents}, ${input.totalCents},
          ${input.notes}, ${createdBy}
        )
        RETURNING id
      `;
      const saved = await getById(String(row.id));
      if (saved) return saved;
      throw new Error("The invoice saved but could not be read back.");
    } catch (error) {
      // 23505 is a unique violation — somebody else took this number first.
      const code = (error as { code?: string })?.code;
      if (code !== "23505" || attempt === 4) throw error;
    }
  }

  throw new Error("Could not allocate an invoice number. Try again.");
}

/**
 * Moves an invoice's status, which is the only thing that may change once it
 * has been issued — the database enforces the rest.
 *
 * A void invoice is final: reopening one would put a cancelled number back
 * into circulation after somebody has already been told to ignore it.
 */
export async function setStatus(id: string, status: InvoiceStatus): Promise<InvoiceRow | null> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE invoices SET status = ${status}, updated_at = now()
       WHERE id = ${id} AND status <> 'void'
       RETURNING id
    `;
    return rows[0] ? await getById(String(rows[0].id)) : null;
  }, null);
}

/** Invoices raised for one client, for their file. */
export async function forClient(clientId: string): Promise<InvoiceRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT ${db().unsafe(COLUMNS)}
        FROM invoices i LEFT JOIN users u ON u.id = i.created_by
       WHERE i.client_id = ${clientId}
       ORDER BY i.issued_on DESC LIMIT 50
    `;
    return rows.map(map);
  }, []);
}

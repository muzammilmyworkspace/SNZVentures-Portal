import { db, safeQuery, isDatabaseConfigured } from "../client";

export type Enquiry = {
  id: string;
  pathway: string;
  name: string;
  email: string;
  phone: string | null;
  preferredContact: string | null;
  notes: string | null;
  answers: Record<string, unknown>;
  delivered: boolean;
  handledAt: string | null;
  createdAt: string;
};

const map = (r: Record<string, unknown>): Enquiry => ({
  id: String(r.id),
  pathway: String(r.pathway),
  name: String(r.name),
  email: String(r.email),
  phone: r.phone ? String(r.phone) : null,
  preferredContact: r.preferred_contact ? String(r.preferred_contact) : null,
  notes: r.notes ? String(r.notes) : null,
  answers: (r.answers ?? {}) as Record<string, unknown>,
  delivered: Boolean(r.delivered),
  handledAt: r.handled_at ? new Date(r.handled_at as string).toISOString() : null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

/**
 * Writes the enquiry down. Called BEFORE any attempt to email it.
 *
 * That order is the whole point. Delivery used to be the only copy, so a
 * missing mail transport or a provider outage meant the lead simply vanished —
 * on the one form the entire marketing site funnels towards. Now the email is a
 * convenience on top of a record that already exists.
 *
 * Returns the id so the caller can mark it delivered, or null if the write
 * itself failed — which is the only case where the caller should tell the
 * visitor to email instead.
 */
export async function createEnquiry(input: {
  pathway: string;
  name: string;
  email: string;
  phone?: string | null;
  preferredContact?: string | null;
  notes?: string | null;
  answers?: Record<string, unknown>;
  ip?: string | null;
}): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [row] = await db()`
      INSERT INTO enquiries
        (pathway, name, email, phone, preferred_contact, notes, answers, ip)
      VALUES (
        ${input.pathway},
        ${input.name.slice(0, 200)},
        ${input.email.slice(0, 200)},
        ${input.phone?.slice(0, 60) ?? null},
        ${input.preferredContact?.slice(0, 40) ?? null},
        ${input.notes?.slice(0, 4000) ?? null},
        ${db().json((input.answers ?? {}) as never)},
        ${input.ip ?? null}
      )
      RETURNING id
    `;
    return row ? String(row.id) : null;
  }, null);
}

/** Records that the email actually went out. Best effort — never blocks a reply. */
export async function markDelivered(id: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    await db()`UPDATE enquiries SET delivered = TRUE WHERE id = ${id}`;
    return null;
  }, null);
}

/** Staff list, newest first, with the undelivered count in the same round trip. */
export async function listEnquiries(limit = 50): Promise<{
  rows: Enquiry[];
  total: number;
  undelivered: number;
  unhandled: number;
}> {
  if (!isDatabaseConfigured()) {
    return { rows: [], total: 0, undelivered: 0, unhandled: 0 };
  }
  return safeQuery(
    async () => {
      /*
        ONE statement, because every portal page has to be one round trip —
        the connection pool is a single connection against Supabase's
        transaction pooler, and concurrent reads starve rather than queue.
      */
      const [r] = await db()`
        SELECT
          COALESCE((SELECT json_agg(x) FROM (
            SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ${limit}
          ) x), '[]'::json) AS rows,
          (SELECT count(*)::int FROM enquiries) AS total,
          (SELECT count(*)::int FROM enquiries WHERE delivered = FALSE) AS undelivered,
          (SELECT count(*)::int FROM enquiries WHERE handled_at IS NULL) AS unhandled
      `;
      return {
        rows: ((r?.rows ?? []) as Record<string, unknown>[]).map(map),
        total: Number(r?.total ?? 0),
        undelivered: Number(r?.undelivered ?? 0),
        unhandled: Number(r?.unhandled ?? 0),
      };
    },
    { rows: [], total: 0, undelivered: 0, unhandled: 0 }
  );
}

/** Marks one enquiry as dealt with. Idempotent — re-marking keeps the first time. */
export async function markHandled(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE enquiries SET handled_at = COALESCE(handled_at, now())
      WHERE id = ${id} RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

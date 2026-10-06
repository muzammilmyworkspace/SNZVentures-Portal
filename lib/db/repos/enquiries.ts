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
  /** Where they came from (023). Null on enquiries from before it was recorded. */
  source: string | null;
  page: string | null;
  landing: string | null;
  referrer: string | null;
  utm: Record<string, string> | null;
  /** When they also pressed "Send on WhatsApp" after the form. */
  whatsappAt: string | null;
  /** Their portal account, if one exists with the same email. */
  accountId?: string | null;
  avatarV?: number | null;
};

export type WhatsAppClick = {
  id: string;
  placement: string | null;
  page: string | null;
  source: string | null;
  campaign: string | null;
  fromForm: boolean;
  createdAt: string;
};

export type WhatsAppSummary = {
  last7: number;
  last30: number;
  fromForm30: number;
  byPlacement: { key: string; n: number }[];
  bySource: { key: string; n: number }[];
  recent: WhatsAppClick[];
};

const EMPTY_WA: WhatsAppSummary = { last7: 0, last30: 0, fromForm30: 0, byPlacement: [], bySource: [], recent: [] };

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
  source: r.source ? String(r.source) : null,
  page: r.page ? String(r.page) : null,
  landing: r.landing ? String(r.landing) : null,
  referrer: r.referrer ? String(r.referrer) : null,
  utm: (r.utm as Record<string, string> | null) ?? null,
  whatsappAt: r.whatsapp_at ? new Date(r.whatsapp_at as string).toISOString() : null,
  accountId: r.account_id ? String(r.account_id) : null,
  avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
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
  whatsapp: WhatsAppSummary;
}> {
  if (!isDatabaseConfigured()) {
    return { rows: [], total: 0, undelivered: 0, unhandled: 0, whatsapp: EMPTY_WA };
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
            SELECT e.*, acct.id AS account_id, acct.avatar_v
            FROM enquiries e
            -- The same person may since have made an account; if so, their
            -- photo is shown and the name links to their file.
            LEFT JOIN LATERAL (
              SELECT u.id,
                     CASE WHEN u.avatar_url IS NULL THEN NULL
                          ELSE floor(extract(epoch FROM u.updated_at))::int END AS avatar_v
              FROM users u WHERE lower(u.email) = lower(e.email) LIMIT 1
            ) acct ON TRUE
            ORDER BY e.created_at DESC LIMIT ${limit}
          ) x), '[]'::json) AS rows,
          (SELECT count(*)::int FROM enquiries) AS total,
          (SELECT count(*)::int FROM enquiries WHERE delivered = FALSE) AS undelivered,
          (SELECT count(*)::int FROM enquiries WHERE handled_at IS NULL) AS unhandled,
          json_build_object(
            'last7', (SELECT count(*)::int FROM whatsapp_clicks WHERE created_at >= now() - interval '7 days'),
            'last30', (SELECT count(*)::int FROM whatsapp_clicks WHERE created_at >= now() - interval '30 days'),
            'fromForm30', (SELECT count(*)::int FROM whatsapp_clicks
                            WHERE created_at >= now() - interval '30 days' AND enquiry_id IS NOT NULL),
            'byPlacement', COALESCE((SELECT json_agg(x ORDER BY x.n DESC) FROM (
                SELECT COALESCE(placement, 'page') AS key, count(*)::int AS n FROM whatsapp_clicks
                WHERE created_at >= now() - interval '30 days' GROUP BY 1) x), '[]'::json),
            'bySource', COALESCE((SELECT json_agg(x ORDER BY x.n DESC) FROM (
                SELECT COALESCE(source, 'direct') AS key, count(*)::int AS n FROM whatsapp_clicks
                WHERE created_at >= now() - interval '30 days' GROUP BY 1) x), '[]'::json),
            'recent', COALESCE((SELECT json_agg(x) FROM (
                SELECT id::text, placement, page, source, utm->>'utm_campaign' AS campaign,
                       enquiry_id IS NOT NULL AS "fromForm", created_at AS "createdAt"
                FROM whatsapp_clicks ORDER BY created_at DESC LIMIT 200) x), '[]'::json)
          ) AS whatsapp
      `;
      return {
        rows: ((r?.rows ?? []) as Record<string, unknown>[]).map(map),
        total: Number(r?.total ?? 0),
        undelivered: Number(r?.undelivered ?? 0),
        unhandled: Number(r?.unhandled ?? 0),
        whatsapp: (r?.whatsapp ?? EMPTY_WA) as WhatsAppSummary,
      };
    },
    { rows: [], total: 0, undelivered: 0, unhandled: 0, whatsapp: EMPTY_WA }
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

/** Undo a mistaken "answered". */
export async function markUnhandled(id: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`UPDATE enquiries SET handled_at = NULL WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }, false);
}

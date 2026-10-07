import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * CONSENT DOCUMENTS, by category (see migration 035).
 *
 *   student             SnZ Ventures <-> student      (super admin)
 *   consultant          SnZ Ventures <-> consultant   (super admin)
 *   consultant_student  a consultant <-> their students (that consultant)
 *
 * A draft is edited in place and never shown. Publishing makes it the one in
 * use for its category and owner. Published versions are never changed:
 * editing one copies it into a new draft, so a signature always points at the
 * words that person read. One in use can be switched off (inactive) and back.
 */

export type ConsentCategory = "student" | "consultant" | "consultant_student";
export const CATEGORIES: ConsentCategory[] = ["student", "consultant", "consultant_student"];

/** What a signature of each category is stored as in `consents.kind`. */
export const KIND: Record<ConsentCategory, string> = {
  student: "student_undertaking",
  consultant: "consultant_agreement",
  consultant_student: "consultant_student",
};

export type ConsentTemplate = {
  id: string;
  category: ConsentCategory;
  ownerId: string | null;
  version: number;
  title: string;
  body: string | null;
  fileKey: string | null;
  fileName: string | null;
  fileType: string | null;
  fileProvider: string | null;
  status: "draft" | "published";
  isCurrent: boolean;
  hasLogo: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

const COLS = (sql: ReturnType<typeof db>) => sql`
  t.id, t.category, t.owner_id, t.version, t.title, t.body, t.file_key, t.file_name, t.file_type,
  t.file_provider, t.status, t.is_current, t.created_at, t.updated_at, t.published_at,
  (t.logo_type IS NOT NULL) AS has_logo
`;

function toTemplate(r: Record<string, unknown>): ConsentTemplate {
  return {
    id: String(r.id),
    category: String(r.category) as ConsentCategory,
    ownerId: r.owner_id ? String(r.owner_id) : null,
    version: Number(r.version),
    title: String(r.title),
    body: r.body ? String(r.body) : null,
    fileKey: r.file_key ? String(r.file_key) : null,
    fileName: r.file_name ? String(r.file_name) : null,
    fileType: r.file_type ? String(r.file_type) : null,
    fileProvider: r.file_provider ? String(r.file_provider) : null,
    status: r.status === "draft" ? "draft" : "published",
    isCurrent: r.is_current === true,
    hasLogo: r.has_logo === true,
    createdBy: r.created_by_name ? String(r.created_by_name) : null,
    createdAt: new Date(r.created_at as string).toISOString(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null,
  };
}

/** The version string stored on each signature made against a template. */
export function templateVersion(t: { category: ConsentCategory; version: number }): string {
  if (t.category === "consultant") return `consultant-v${t.version}`;
  if (t.category === "consultant_student") return `partner-v${t.version}`;
  return `custom-v${t.version}`;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function listTemplates(category: ConsentCategory, ownerId: string | null): Promise<ConsentTemplate[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const sql = db();
    const rows = await sql`
      SELECT ${COLS(sql)}, u.name AS created_by_name
        FROM consent_templates t LEFT JOIN users u ON u.id = t.created_by
       WHERE t.category = ${category}
         AND t.owner_id IS NOT DISTINCT FROM ${ownerId}
       ORDER BY t.version DESC
    `;
    return rows.map(toTemplate);
  }, []);
}

/** Every consultant's own consent in use, for the super admin to look over. */
export async function consultantsInUse(): Promise<(ConsentTemplate & { ownerName: string })[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const sql = db();
    const rows = await sql`
      SELECT ${COLS(sql)}, NULL AS created_by_name, o.name AS owner_name
        FROM consent_templates t JOIN users o ON o.id = t.owner_id
       WHERE t.category = 'consultant_student' AND t.is_current
       ORDER BY o.name
    `;
    return rows.map((r) => ({ ...toTemplate(r), ownerName: String(r.owner_name) }));
  }, []);
}

export async function currentTemplate(category: ConsentCategory, ownerId: string | null): Promise<ConsentTemplate | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const sql = db();
    const [r] = await sql`
      SELECT ${COLS(sql)}, NULL AS created_by_name
        FROM consent_templates t
       WHERE t.category = ${category} AND t.owner_id IS NOT DISTINCT FROM ${ownerId} AND t.is_current
       LIMIT 1
    `;
    return r ? toTemplate(r) : null;
  }, null);
}

export async function getTemplate(id: string): Promise<ConsentTemplate | null> {
  if (!isDatabaseConfigured() || !UUID.test(id)) return null;
  return safeQuery(async () => {
    const sql = db();
    const [r] = await sql`SELECT ${COLS(sql)}, NULL AS created_by_name FROM consent_templates t WHERE t.id = ${id}`;
    return r ? toTemplate(r) : null;
  }, null);
}

export async function getConsentLogo(id: string): Promise<{ data: Buffer; type: string } | null> {
  if (!isDatabaseConfigured() || !UUID.test(id)) return null;
  return safeQuery(async () => {
    const [r] = await db()`SELECT logo_data, logo_type FROM consent_templates WHERE id = ${id} AND logo_type IS NOT NULL`;
    return r ? { data: r.logo_data as Buffer, type: String(r.logo_type) } : null;
  }, null);
}

type Logo = { data: Buffer; type: string };

/**
 * A new draft. `logo: "keep"` copies the logo of the one in use (or of the
 * version it was copied from), so a new version keeps the letterhead.
 */
export async function createDraft(input: {
  category: ConsentCategory;
  ownerId: string | null;
  title: string;
  body: string | null;
  file: { key: string; name: string; type: string; provider: string } | null;
  logo: Logo | "keep" | null;
  /** Copy the logo from this version instead of the one in use. */
  logoFrom?: string | null;
  createdBy: string;
}): Promise<ConsentTemplate | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      let logo: { data: Buffer | null; type: string | null } = { data: null, type: null };
      if (input.logo === "keep") {
        const [prev] = input.logoFrom
          ? await sql`SELECT logo_data, logo_type FROM consent_templates WHERE id = ${input.logoFrom} AND logo_type IS NOT NULL`
          : await sql`SELECT logo_data, logo_type FROM consent_templates
                       WHERE category = ${input.category} AND owner_id IS NOT DISTINCT FROM ${input.ownerId}
                         AND is_current AND logo_type IS NOT NULL`;
        if (prev) logo = { data: prev.logo_data as Buffer, type: String(prev.logo_type) };
      } else if (input.logo) {
        logo = input.logo;
      }
      const [r] = await sql`
        INSERT INTO consent_templates
          (category, owner_id, version, title, body, file_key, file_name, file_type, file_provider,
           logo_data, logo_type, status, is_current, created_by)
        VALUES (
          ${input.category}, ${input.ownerId},
          (SELECT COALESCE(MAX(version), 0) + 1 FROM consent_templates),
          ${input.title}, ${input.body},
          ${input.file?.key ?? null}, ${input.file?.name ?? null}, ${input.file?.type ?? null}, ${input.file?.provider ?? null},
          ${logo.data}, ${logo.type}, 'draft', FALSE, ${input.createdBy}
        )
        RETURNING id
      `;
      return String(r.id);
    });
  }, null).then((id) => (id ? getTemplate(id) : null));
}

/** Change a draft. `logo`: undefined keeps it, null removes it. */
export async function updateDraft(
  id: string,
  patch: { title: string; body: string | null; logo?: Logo | null }
): Promise<boolean> {
  if (!isDatabaseConfigured() || !UUID.test(id)) return false;
  return safeQuery(async () => {
    const rows =
      patch.logo === undefined
        ? await db()`
            UPDATE consent_templates SET title = ${patch.title}, body = ${patch.body}, updated_at = now()
             WHERE id = ${id} AND status = 'draft' RETURNING id`
        : await db()`
            UPDATE consent_templates
               SET title = ${patch.title}, body = ${patch.body},
                   logo_data = ${patch.logo?.data ?? null}, logo_type = ${patch.logo?.type ?? null}, updated_at = now()
             WHERE id = ${id} AND status = 'draft' RETURNING id`;
    return rows.length > 0;
  }, false);
}

/** Publish a draft: it becomes the one in use for its category and owner. */
export async function publishDraft(id: string): Promise<boolean> {
  if (!isDatabaseConfigured() || !UUID.test(id)) return false;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      const [t] = await sql`SELECT category, owner_id FROM consent_templates WHERE id = ${id} AND status = 'draft'`;
      if (!t) return false;
      await sql`UPDATE consent_templates SET is_current = FALSE
                 WHERE category = ${t.category} AND owner_id IS NOT DISTINCT FROM ${t.owner_id} AND is_current`;
      await sql`UPDATE consent_templates
                   SET status = 'published', is_current = TRUE, published_at = now(), updated_at = now()
                 WHERE id = ${id}`;
      return true;
    });
  }, false);
}

/** Put a published version in use, or take it out of use. */
export async function setActive(id: string, active: boolean): Promise<boolean> {
  if (!isDatabaseConfigured() || !UUID.test(id)) return false;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      const [t] = await sql`SELECT category, owner_id FROM consent_templates WHERE id = ${id} AND status = 'published'`;
      if (!t) return false;
      if (active) {
        await sql`UPDATE consent_templates SET is_current = FALSE
                   WHERE category = ${t.category} AND owner_id IS NOT DISTINCT FROM ${t.owner_id} AND is_current`;
      }
      await sql`UPDATE consent_templates SET is_current = ${active}, updated_at = now() WHERE id = ${id}`;
      return true;
    });
  }, false);
}

/** How many people signed this version. */
export async function signedCount(t: ConsentTemplate): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT count(*)::int AS n FROM consents WHERE kind = ${KIND[t.category]} AND version = ${templateVersion(t)}`;
    return Number(r?.n ?? 0);
  }, 0);
}

/** Signatures per version string, for one category. */
export async function signaturesByVersion(category: ConsentCategory): Promise<Record<string, number>> {
  if (!isDatabaseConfigured()) return {};
  return safeQuery(async () => {
    const rows = await db()`
      SELECT version, count(*)::int AS n FROM consents WHERE kind = ${KIND[category]} GROUP BY version`;
    return Object.fromEntries(rows.map((r) => [String(r.version), Number(r.n)]));
  }, {});
}

/**
 * Delete a version. Refused once anybody has signed it: that signature must
 * keep the words it was given. Such a version can be made inactive instead.
 */
export async function deleteTemplate(id: string): Promise<{ ok: boolean; reason?: string; fileKey?: string | null; fileProvider?: string | null }> {
  const t = await getTemplate(id);
  if (!t) return { ok: false, reason: "Not found." };
  if (t.status === "published" && (await signedCount(t)) > 0) {
    return { ok: false, reason: "People have signed this version, so it is kept. Make it inactive instead." };
  }
  const ok = await safeQuery(async () => {
    await db()`DELETE FROM consent_templates WHERE id = ${id}`;
    return true;
  }, false);
  return { ok, fileKey: t.fileKey, fileProvider: t.fileProvider };
}

/* ------------------------------------------------------------ signing */

/** Has this person signed this exact version? */
export async function hasSigned(userId: string, t: ConsentTemplate): Promise<boolean> {
  if (!isDatabaseConfigured()) return true;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT 1 FROM consents WHERE user_id = ${userId} AND kind = ${KIND[t.category]} AND version = ${templateVersion(t)}`;
    return Boolean(r);
  }, true);
}

/** The consultant (an advisor) a student came through, if any. */
export async function consultantOf(studentId: string): Promise<{ id: string; name: string } | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT a.id, a.name FROM staff_assignments sa JOIN users a ON a.id = sa.advisor_id
       WHERE sa.client_id = ${studentId} AND a.role = 'advisor' AND a.status = 'active'
       ORDER BY sa.created_at ASC LIMIT 1`;
    return r ? { id: String(r.id), name: String(r.name) } : null;
  }, null);
}

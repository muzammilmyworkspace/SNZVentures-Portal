import { db, safeQuery, isDatabaseConfigured } from "../client";
import type { IntakeDefinition } from "@/lib/application/types";

/**
 * THE FORMS A SUPER ADMIN CAN CHANGE: the consent students sign, and the
 * application form itself. See migration 032.
 */

/* ------------------------------------------------------------ consent */

export type ConsentTemplate = {
  id: string;
  version: number;
  title: string;
  body: string | null;
  fileKey: string | null;
  fileName: string | null;
  fileType: string | null;
  fileProvider: string | null;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: string;
};

function toTemplate(r: Record<string, unknown>): ConsentTemplate {
  return {
    id: String(r.id),
    version: Number(r.version),
    title: String(r.title),
    body: r.body ? String(r.body) : null,
    fileKey: r.file_key ? String(r.file_key) : null,
    fileName: r.file_name ? String(r.file_name) : null,
    fileType: r.file_type ? String(r.file_type) : null,
    fileProvider: r.file_provider ? String(r.file_provider) : null,
    isCurrent: r.is_current === true,
    createdBy: r.created_by_name ? String(r.created_by_name) : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** The version string stored on each signature made against a template. */
export const templateVersion = (t: { version: number }) => `custom-v${t.version}`;

export async function listConsentTemplates(): Promise<ConsentTemplate[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT t.*, u.name AS created_by_name
      FROM consent_templates t LEFT JOIN users u ON u.id = t.created_by
      ORDER BY t.version DESC
    `;
    return rows.map(toTemplate);
  }, []);
}

export async function currentConsentTemplate(): Promise<ConsentTemplate | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT t.*, u.name AS created_by_name
      FROM consent_templates t LEFT JOIN users u ON u.id = t.created_by
      WHERE t.is_current LIMIT 1
    `;
    return r ? toTemplate(r) : null;
  }, null);
}

export async function getConsentTemplate(id: string): Promise<ConsentTemplate | null> {
  if (!isDatabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return safeQuery(async () => {
    const [r] = await db()`SELECT t.*, NULL AS created_by_name FROM consent_templates t WHERE t.id = ${id}`;
    return r ? toTemplate(r) : null;
  }, null);
}

/** A new version, made current at once. Old versions are never edited. */
export async function createConsentTemplate(input: {
  title: string;
  body: string | null;
  file: { key: string; name: string; type: string; provider: string } | null;
  createdBy: string;
}): Promise<ConsentTemplate | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      await sql`UPDATE consent_templates SET is_current = FALSE WHERE is_current`;
      const [r] = await sql`
        INSERT INTO consent_templates (version, title, body, file_key, file_name, file_type, file_provider, is_current, created_by)
        VALUES (
          (SELECT COALESCE(MAX(version), 0) + 1 FROM consent_templates),
          ${input.title}, ${input.body},
          ${input.file?.key ?? null}, ${input.file?.name ?? null}, ${input.file?.type ?? null}, ${input.file?.provider ?? null},
          TRUE, ${input.createdBy}
        )
        RETURNING *, NULL AS created_by_name
      `;
      return toTemplate(r);
    });
  }, null);
}

/** Make an older version current again, or (null) go back to the built-in wording. */
export async function setCurrentConsent(id: string | null): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      await sql`UPDATE consent_templates SET is_current = FALSE WHERE is_current`;
      if (id) {
        const rows = await sql`UPDATE consent_templates SET is_current = TRUE WHERE id = ${id} RETURNING id`;
        if (!rows.length) throw new Error("not found");
      }
      return true;
    });
  }, false);
}

/** How many students signed each version, keyed by the stored version string. */
export async function signaturesByVersion(): Promise<Record<string, number>> {
  if (!isDatabaseConfigured()) return {};
  return safeQuery(async () => {
    const rows = await db()`
      SELECT version, COUNT(*)::int AS n FROM consents
      WHERE kind = 'student_undertaking' GROUP BY version
    `;
    return Object.fromEntries(rows.map((r) => [String(r.version), Number(r.n)]));
  }, {});
}

/* ------------------------------------------------------- application form */

export type FormOverride = {
  definition: IntakeDefinition;
  updatedBy: string | null;
  updatedAt: string;
};

export async function getFormOverride(pathway: string): Promise<FormOverride | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT f.definition, f.updated_at, u.name AS updated_by_name
      FROM form_definitions f LEFT JOIN users u ON u.id = f.updated_by
      WHERE f.pathway = ${pathway}
    `;
    if (!r) return null;
    return {
      definition: r.definition as IntakeDefinition,
      updatedBy: r.updated_by_name ? String(r.updated_by_name) : null,
      updatedAt: new Date(r.updated_at as string).toISOString(),
    };
  }, null);
}

export async function saveFormOverride(pathway: string, definition: IntakeDefinition, by: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO form_definitions (pathway, definition, updated_by, updated_at)
      VALUES (${pathway}, ${db().json(definition as never)}, ${by}, now())
      ON CONFLICT (pathway) DO UPDATE
        SET definition = EXCLUDED.definition, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;
    return true;
  }, false);
}

export async function resetFormOverride(pathway: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`DELETE FROM form_definitions WHERE pathway = ${pathway}`;
    return true;
  }, false);
}

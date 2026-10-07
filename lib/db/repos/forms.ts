import { db, safeQuery, isDatabaseConfigured } from "../client";
import type { IntakeDefinition } from "@/lib/application/types";

/**
 * THE APPLICATION FORM AS THE SUPER ADMIN EDITED IT (migration 032). The
 * consent documents live in consent-templates.ts.
 */

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

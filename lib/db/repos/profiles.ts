import { db, safeQuery } from "../client";
import type { Role } from "@/lib/auth/types";

/**
 * PROFILES — shared contact block plus one typed table per pathway.
 * Column names are whitelisted per role so a client cannot write into another
 * pathway's schema or into a column that isn't theirs.
 */

const TABLE: Record<string, string> = {
  student: "student_profiles",
  professional: "professional_profiles",
  business: "business_profiles",
};

const SHARED = ["phone", "nationality", "country", "city"] as const;

const PATHWAY_COLUMNS: Record<string, string[]> = {
  student: ["level", "field_of_study", "destination", "intake", "scholarship", "budget", "language_level"],
  professional: ["title", "experience_years", "industry", "skills", "destination", "relocation", "language_level"],
  business: ["business_name", "industry", "current_location", "target_country", "objective", "company_type", "stage"],
};

export function profileColumns(role: Role): string[] {
  return [...SHARED, ...(PATHWAY_COLUMNS[role] ?? [])];
}

export async function getProfile(userId: string, role: Role): Promise<Record<string, string>> {
  return safeQuery(async () => {
    const out: Record<string, string> = {};
    const [shared] = await db()`SELECT * FROM profiles WHERE user_id = ${userId}`;
    if (shared) {
      for (const c of SHARED) if (shared[c]) out[c] = String(shared[c]);
    }
    const table = TABLE[role];
    if (table) {
      const rows = await db().unsafe(
        `SELECT * FROM ${table} WHERE user_id = $1`,
        [userId]
      );
      const row = rows[0];
      if (row) {
        for (const c of PATHWAY_COLUMNS[role]) if (row[c]) out[c] = String(row[c]);
      }
    }
    return out;
  }, {});
}

export async function saveProfile(
  userId: string,
  role: Role,
  patch: Record<string, string>
) {
  const sharedPatch: Record<string, string | null> = {};
  const pathPatch: Record<string, string | null> = {};

  for (const [k, v] of Object.entries(patch)) {
    const value = v.trim().slice(0, 400) || null;
    if ((SHARED as readonly string[]).includes(k)) sharedPatch[k] = value;
    else if ((PATHWAY_COLUMNS[role] ?? []).includes(k)) pathPatch[k] = value;
    // Anything else is silently dropped — no arbitrary column writes.
  }

  if (Object.keys(sharedPatch).length) {
    const cols = Object.keys(sharedPatch);
    const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await db().unsafe(
      `INSERT INTO profiles (user_id, ${cols.join(", ")})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET ${sets}, updated_at = now()`,
      [userId, ...cols.map((c) => sharedPatch[c])]
    );
  }

  const table = TABLE[role];
  if (table && Object.keys(pathPatch).length) {
    const cols = Object.keys(pathPatch);
    const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await db().unsafe(
      `INSERT INTO ${table} (user_id, ${cols.join(", ")})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
       ON CONFLICT (user_id) DO UPDATE SET ${sets}, updated_at = now()`,
      [userId, ...cols.map((c) => pathPatch[c])]
    );
  }
}

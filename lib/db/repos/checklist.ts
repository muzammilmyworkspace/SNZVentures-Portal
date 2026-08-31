import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";

/**
 * The applicant's own record of which document requirements they have met.
 *
 * Separate from the application on purpose — see migration 011. The checklist
 * spans the admission and visa stages, and has to stay usable long after the
 * application itself locks.
 */

/** Every item this person has ticked, as the map the UI works in. */
export async function ticksFor(userId: string): Promise<Record<string, boolean>> {
  if (!isDatabaseConfigured()) return {};
  return safeQuery(async () => {
    const rows = await db()`SELECT item_id FROM checklist_ticks WHERE user_id = ${userId}`;
    const map: Record<string, boolean> = {};
    for (const row of rows) map[String(row.item_id)] = true;
    return map;
  }, {});
}

/**
 * Tick or untick one item.
 *
 * Ticking inserts and unticking deletes, so the table holds only what is true.
 * ON CONFLICT DO NOTHING because a double tap — or a retry over a flaky
 * connection — is the same statement twice, not two facts.
 */
export async function setTick(
  userId: string,
  itemId: string,
  on: boolean
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    if (on) {
      await db()`
        INSERT INTO checklist_ticks (user_id, item_id)
        VALUES (${userId}, ${itemId})
        ON CONFLICT (user_id, item_id) DO NOTHING
      `;
    } else {
      await db()`
        DELETE FROM checklist_ticks WHERE user_id = ${userId} AND item_id = ${itemId}
      `;
    }
    return true;
  }, false);
}

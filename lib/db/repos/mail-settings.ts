import "server-only";
import { db, safeQuery, isDatabaseConfigured } from "../client";
import { seal, open } from "@/lib/integrations/secret-box";

/**
 * MAIL CREDENTIALS ENTERED THROUGH THE PORTAL.
 *
 * See migration 021 for why they can live here at all. The short version: a
 * setting whose absence breaks password resets should be fixable by the people
 * who run the portal, from the portal, without a deploy.
 *
 * The key is sealed on the way in and only unsealed by `liveKey`, which is
 * called on the server at the moment a message is sent. Nothing here ever
 * returns it to a caller that might render it.
 */

export type StoredMail = {
  /** Present, never the value. */
  hasKey: boolean;
  fromAddress: string;
  updatedAt: string | null;
  lastError: string | null;
  lastSentAt: string | null;
};

export async function getStoredMail(): Promise<StoredMail | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT from_address, updated_at, last_error, last_sent_at
        FROM mail_settings WHERE id = TRUE LIMIT 1
    `;
    if (!rows[0]) return null;
    return {
      hasKey: true,
      fromAddress: String(rows[0].from_address),
      updatedAt: rows[0].updated_at ? new Date(String(rows[0].updated_at)).toISOString() : null,
      lastError: rows[0].last_error ? String(rows[0].last_error) : null,
      lastSentAt: rows[0].last_sent_at
        ? new Date(String(rows[0].last_sent_at)).toISOString()
        : null,
    };
  }, null);
}

/**
 * The usable key, unsealed.
 *
 * Returns null rather than throwing when the row cannot be decrypted — which
 * happens if AUTH_SECRET has been rotated since it was saved. That is not an
 * error to crash on; it means the stored key is no longer readable and has to
 * be entered again, and the caller should behave as though mail is not
 * configured.
 */
export async function liveKey(): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const rows = await db()`SELECT api_key FROM mail_settings WHERE id = TRUE LIMIT 1`;
    if (!rows[0]) return null;
    return open(String(rows[0].api_key));
  }, null);
}

export async function saveMail(input: {
  apiKey: string;
  fromAddress: string;
  userId: string;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO mail_settings (id, api_key, from_address, updated_by, updated_at, last_error)
      VALUES (TRUE, ${seal(input.apiKey)}, ${input.fromAddress}, ${input.userId}, now(), NULL)
      ON CONFLICT (id) DO UPDATE SET
        api_key      = EXCLUDED.api_key,
        from_address = EXCLUDED.from_address,
        updated_by   = EXCLUDED.updated_by,
        updated_at   = now(),
        -- A new key makes the old failure meaningless; leaving it would have
        -- the screen reporting an error that belongs to a credential nobody
        -- is using any more.
        last_error   = NULL
    `;
    return true;
  }, false);
}

export async function clearMail(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`DELETE FROM mail_settings WHERE id = TRUE`;
    return true;
  }, false);
}

/**
 * Record what happened, so the admin screen can say more than "it failed".
 *
 * Deliberately not awaited by senders on the success path — a message that
 * went out has gone out, and failing to write a timestamp about it must not
 * turn that into an error.
 */
export async function noteResult(error: string | null): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    /*
      Two statements rather than one with a conditional column, because a
      failure must not move `last_sent_at`. The screen reads the pair together
      — "last sent at X, last error Y" — and a failure that bumped the
      timestamp would claim a delivery that did not happen.
    */
    if (error) {
      await db()`
        UPDATE mail_settings SET last_error = ${error.slice(0, 500)} WHERE id = TRUE
      `;
    } else {
      await db()`
        UPDATE mail_settings SET last_error = NULL, last_sent_at = now() WHERE id = TRUE
      `;
    }
    return true;
  }, false);
}

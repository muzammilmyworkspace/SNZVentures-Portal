import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";
import { seal, open } from "@/lib/integrations/secret-box";

/**
 * The firm's one Google Drive connection, and where each client's folder went.
 *
 * The refresh token never leaves this module in its stored form: it is sealed
 * on the way in and opened on the way out, so nothing above here handles
 * ciphertext and nothing below here handles a bare credential.
 */

export type DriveConnection = {
  connected: boolean;
  accountEmail: string | null;
  rootFolderId: string | null;
  connectedAt: string | null;
  /** Set when the stored token could not be opened — see secret-box. */
  unreadable: boolean;
};

export async function connectionStatus(): Promise<DriveConnection> {
  const none: DriveConnection = {
    connected: false,
    accountEmail: null,
    rootFolderId: null,
    connectedAt: null,
    unreadable: false,
  };
  if (!isDatabaseConfigured()) return none;

  return safeQuery(async () => {
    const rows = await db()`
      SELECT refresh_token, account_email, root_folder_id, connected_at
      FROM drive_connection WHERE id = TRUE LIMIT 1
    `;
    const row = rows[0];
    if (!row) return none;

    const token = open(String(row.refresh_token));
    return {
      connected: token !== null,
      accountEmail: row.account_email ? String(row.account_email) : null,
      rootFolderId: row.root_folder_id ? String(row.root_folder_id) : null,
      connectedAt: row.connected_at ? new Date(row.connected_at as string).toISOString() : null,
      /*
        A token that will not open is not the same as no connection. It means
        AUTH_SECRET was rotated, and the screen should say "reconnect" rather
        than "connect" — which is a different, and much less alarming, message
        for somebody who knows they connected it last week.
      */
      unreadable: token === null,
    };
  }, none);
}

/** The live refresh token, or null. Only the export path should call this. */
export async function refreshToken(): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const rows = await db()`SELECT refresh_token FROM drive_connection WHERE id = TRUE LIMIT 1`;
    return rows[0] ? open(String(rows[0].refresh_token)) : null;
  }, null);
}

export async function saveConnection(input: {
  refreshToken: string;
  accountEmail: string | null;
  connectedBy: string;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO drive_connection (id, refresh_token, account_email, connected_by, connected_at)
      VALUES (TRUE, ${seal(input.refreshToken)}, ${input.accountEmail}, ${input.connectedBy}, now())
      ON CONFLICT (id) DO UPDATE SET
        refresh_token = EXCLUDED.refresh_token,
        account_email = EXCLUDED.account_email,
        connected_by  = EXCLUDED.connected_by,
        connected_at  = now(),
        root_folder_id = NULL,
        last_error    = NULL
    `;
    return true;
  }, false);
}

export async function saveRootFolder(id: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    await db()`UPDATE drive_connection SET root_folder_id = ${id} WHERE id = TRUE`;
    return true;
  }, false);
}

export async function disconnect(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    /*
      The row goes, the folder stays. Files already in the firm's Drive belong
      to the firm; deleting a client's documents because somebody unlinked an
      integration would be an astonishing thing for a disconnect button to do.
    */
    await db()`DELETE FROM drive_connection WHERE id = TRUE`;
    return true;
  }, false);
}

/* ─────────────────────────────────────────────────────────── exports ─── */

export type DriveExport = {
  folderId: string;
  folderUrl: string;
  exportedAt: string;
  fileCount: number;
};

export async function exportFor(userId: string): Promise<DriveExport | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT folder_id, folder_url, exported_at, file_count
      FROM drive_exports WHERE user_id = ${userId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      folderId: String(row.folder_id),
      folderUrl: String(row.folder_url),
      exportedAt: new Date(row.exported_at as string).toISOString(),
      fileCount: Number(row.file_count ?? 0),
    };
  }, null);
}

export async function recordExport(input: {
  userId: string;
  folderId: string;
  folderUrl: string;
  exportedBy: string;
  fileCount: number;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await safeQuery(async () => {
    await db()`
      INSERT INTO drive_exports (user_id, folder_id, folder_url, exported_by, exported_at, file_count)
      VALUES (${input.userId}, ${input.folderId}, ${input.folderUrl}, ${input.exportedBy}, now(), ${input.fileCount})
      ON CONFLICT (user_id) DO UPDATE SET
        folder_id   = EXCLUDED.folder_id,
        folder_url  = EXCLUDED.folder_url,
        exported_by = EXCLUDED.exported_by,
        exported_at = now(),
        file_count  = EXCLUDED.file_count
    `;
    return true;
  }, false);
}

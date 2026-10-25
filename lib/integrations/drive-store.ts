import "server-only";
import { refreshToken } from "@/lib/db/repos/drive";
import { accessTokenFrom, ensureFolder, putFile } from "./drive";

/**
 * A file from the CRM (a sales member's signed onboarding document), put in
 * the firm's Google Drive through the portal's Drive connection, under a
 * chain of folders such as ["AdmitsFair Team Documents", "AF-001 — Name"].
 * Folders are found by name before being created, so repeats land in one
 * place; a file with the same name in the same folder is replaced.
 */
export async function storeInDrive(input: {
  folders: string[];
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{ ok: true; folderUrl: string } | { ok: false; error: string }> {
  const stored = await refreshToken();
  if (!stored) return { ok: false, error: "Google Drive is not connected on the portal (Integrations → Google Drive)." };
  const token = await accessTokenFrom(stored);
  if (!token) return { ok: false, error: "The portal's Google Drive connection was refused. Connect Drive again on the portal." };

  let parent: { id: string; url: string } | null = null;
  for (const name of input.folders) {
    parent = await ensureFolder(token, name, parent?.id);
    if (!parent) return { ok: false, error: `Could not open the Drive folder "${name}".` };
  }
  if (!parent) return { ok: false, error: "No folder given." };
  const ok = await putFile(token, parent.id, input.fileName, input.bytes, input.mimeType);
  return ok ? { ok: true, folderUrl: parent.url } : { ok: false, error: "Google Drive refused the upload." };
}

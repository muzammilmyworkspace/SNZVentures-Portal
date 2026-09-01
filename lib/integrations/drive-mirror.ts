import { refreshToken, connectionStatus, saveRootFolder, recordMirror } from "@/lib/db/repos/drive";
import { accessTokenFrom, ensureFolder, putFile, ROOT_FOLDER_NAME } from "./drive";

/**
 * EVERY UPLOAD, COPIED INTO THE STUDENT'S OWN DRIVE FOLDER.
 * ---------------------------------------------------------------------------
 * A student sends their fee receipt, then their passport, then a transcript,
 * over weeks. Each one lands in private storage — and, if Drive is connected,
 * in a folder in the firm's Drive named after them, ready to share with a
 * university without anybody assembling anything first.
 *
 * IT MUST NEVER BREAK THE UPLOAD. Drive being down, a revoked token, an
 * expired grant, Google rate limiting — none of that is the student's problem,
 * and none of it may cost them a receipt they just spent ten minutes
 * photographing. Every failure here is swallowed and logged. The file is
 * already safe in storage before this runs; this is a copy, not the copy.
 *
 * IT RUNS AFTER THE RESPONSE, via next/server's `after`. Uploading a 5 MB scan
 * to Google inside the request would add seconds to a button press for no
 * benefit the student can see. They get their answer immediately and the copy
 * happens behind it, in the same invocation, so it is not lost to a serverless
 * process being torn down.
 *
 * THE FOLDER IS FOUND, NOT REMEMBERED BLINDLY. ensureFolder searches by name
 * before creating, so ten uploads produce one folder, and a folder somebody
 * moved or renamed in Drive is recreated rather than written into invisibly.
 */

/** A folder name a human can find: their name, and the email that identifies them. */
export function studentFolderName(name: string, email: string): string {
  const clean = (name || "").trim().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ");
  return clean ? `${clean} — ${email}` : email;
}

export async function mirrorToDrive(input: {
  userId: string;
  studentName: string;
  studentEmail: string;
  fileName: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<void> {
  try {
    const stored = await refreshToken();
    // Not connected is the normal state until somebody connects it, and is not
    // worth a log line on every upload.
    if (!stored) return;

    const token = await accessTokenFrom(stored);
    if (!token) {
      // eslint-disable-next-line no-console
      console.error("[drive] the stored connection was refused — it may have been revoked");
      return;
    }

    const status = await connectionStatus();
    let rootId = status.rootFolderId;
    if (!rootId) {
      const root = await ensureFolder(token, ROOT_FOLDER_NAME);
      if (!root) return;
      rootId = root.id;
      await saveRootFolder(rootId);
    }

    const folder = await ensureFolder(
      token,
      studentFolderName(input.studentName, input.studentEmail),
      rootId
    );
    if (!folder) return;

    const safeName = input.fileName.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
    const ok = await putFile(token, folder.id, safeName, input.bytes, input.mimeType);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error(`[drive] could not copy ${safeName} for ${input.studentEmail}`);
      return;
    }

    await recordMirror(input.userId, folder.id, folder.url);
  } catch (error) {
    /*
      Deliberately swallowed. This runs after the response has gone, so there
      is nobody left to tell — and the one thing that must not happen is an
      unhandled rejection taking down an invocation that has already told a
      student their upload succeeded. It did. This copy did not.
    */
    // eslint-disable-next-line no-console
    console.error("[drive] mirror failed:", error instanceof Error ? error.message : error);
  }
}

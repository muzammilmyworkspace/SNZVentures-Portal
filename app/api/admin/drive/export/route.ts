import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import * as store from "@/lib/db/repos/users";
import { getDocumentsForOwner } from "@/lib/db/repos/portal";
import { getIntake } from "@/lib/db/repos/operations";
import { feeHistoryFor } from "@/lib/db/repos/fees";
import { consentsFor } from "@/lib/db/repos/consents";
import { refreshToken, connectionStatus, recordExport, saveRootFolder } from "@/lib/db/repos/drive";
import {
  accessTokenFrom,
  ensureFolder,
  putFile,
  shareFolderWith,
  ROOT_FOLDER_NAME,
} from "@/lib/integrations/drive";
import { getSignedUrl } from "@/lib/storage";
import { intakeFor } from "@/lib/portal/intake";
import { filenamePrefix } from "@/lib/application/documents";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import type { IntakeField } from "@/lib/application/types";
import { DECORATIVE, optionsFor } from "@/lib/application/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * ONE CLIENT'S WHOLE FILE, COPIED INTO THE FIRM'S DRIVE.
 * ---------------------------------------------------------------------------
 * Staff press this when a case has to leave the portal — to a university, or
 * to somebody who needs to read it and does not have an account here. It
 * gathers the answers, every document, the receipt and the signed undertaking
 * into one folder named after the client, and hands back the folder link.
 *
 * IT IS DELIBERATELY A DELIBERATE ACT. Nothing mirrors automatically. Every
 * copy of a passport that exists is a copy that can leak, so each one is made
 * because a named member of staff decided a named person needed it, and the
 * audit log records who and when.
 *
 * SHARING IS WITH A NAMED PERSON, never "anyone with the link". Google emails
 * them, so they still get a link — addressed to them, revocable, attributable.
 */

/** The answers as something a reader can actually read. */
function answersToText(
  fields: IntakeField[],
  data: Record<string, unknown>,
  title: string
): string {
  const lines: string[] = [title.toUpperCase(), "=".repeat(title.length), ""];

  const value = (field: IntakeField): string | null => {
    const v = data[field.key];
    if (v === undefined || v === null) return null;
    if (field.type === "checkbox") return v === true ? "Yes" : null;
    if (field.type === "repeater") {
      const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
      const out = rows
        .map((row, i) =>
          (field.item ?? [])
            .map((sub) => {
              const cell = String(row?.[sub.key] ?? "").trim();
              return cell ? `      ${sub.label}: ${cell}` : null;
            })
            .filter(Boolean)
            .join("\n")
            .replace(/^/, `   ${i + 1}.\n`)
        )
        .filter(Boolean);
      return out.length ? `\n${out.join("\n")}` : null;
    }
    if (field.type === "documents") {
      const held = (v ?? {}) as Record<string, unknown>;
      const names = Object.entries(held).map(([slot, name]) => `      ${slot}: ${String(name)}`);
      return names.length ? `\n${names.join("\n")}` : null;
    }
    if (Array.isArray(v)) return v.length ? v.join(", ") : null;
    const text = String(v).trim();
    return text || null;
  };

  for (const field of fields) {
    if (DECORATIVE.has(field.type)) continue;
    const shown = value(field);
    if (shown === null) continue;
    lines.push(`${field.label}: ${shown}`);
  }

  void optionsFor;
  return lines.join("\n");
}

export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const ip = clientIp(request);

  // An export moves megabytes and hits Google repeatedly; a stuck button
  // should not turn into a queue of identical uploads.
  if (!rateLimit(`drive:${session.userId}`, { limit: 10, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Give the last export a moment to finish." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { userId, shareWith } = (body ?? {}) as Record<string, unknown>;
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ ok: false, error: "Which client?" }, { status: 400 });
  }
  const recipient = typeof shareWith === "string" ? shareWith.trim() : "";
  if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recipient)) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a valid email address." },
      { status: 400 }
    );
  }

  const stored = await refreshToken();
  if (!stored) {
    return NextResponse.json(
      { ok: false, error: "Google Drive is not connected. Connect it under Integrations." },
      { status: 409 }
    );
  }

  const token = await accessTokenFrom(stored);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google refused the stored connection. It may have been revoked — reconnect it under Integrations.",
      },
      { status: 502 }
    );
  }

  const user = await store.findById(userId);
  if (!user) return NextResponse.json({ ok: false, error: "No such client." }, { status: 404 });

  /* ------------------------------------------------------------- gather */

  const [documents, intake, fees, consents, status] = await Promise.all([
    getDocumentsForOwner(userId),
    getIntake(userId, "study"),
    feeHistoryFor(userId),
    consentsFor(userId),
    connectionStatus(),
  ]);

  const data = (intake?.data ?? {}) as Record<string, unknown>;
  const prefix = filenamePrefix(
    String(data.familyName ?? user.name.split(" ").slice(-1)[0] ?? ""),
    String(data.givenName ?? user.name.split(" ")[0] ?? "")
  );

  /* ------------------------------------------------------------ folders */

  let rootId = status.rootFolderId;
  if (!rootId) {
    const root = await ensureFolder(token, ROOT_FOLDER_NAME);
    if (!root) {
      return NextResponse.json(
        { ok: false, error: "Could not create the folder in Drive." },
        { status: 502 }
      );
    }
    rootId = root.id;
    await saveRootFolder(rootId);
  }

  const folderName = `${prefix} — ${user.email}`;
  const folder = await ensureFolder(token, folderName, rootId);
  if (!folder) {
    return NextResponse.json(
      { ok: false, error: "Could not create this client's folder in Drive." },
      { status: 502 }
    );
  }

  /* -------------------------------------------------------------- files */

  let count = 0;
  const failures: string[] = [];

  if (intake) {
    const text = answersToText(
      intakeFor("study").steps.flatMap((s) => s.fields),
      data,
      `${user.name} — application`
    );
    const ok = await putFile(
      token,
      folder.id,
      `${prefix}_APPLICATION.txt`,
      Buffer.from(text, "utf8"),
      "text/plain"
    );
    ok ? count++ : failures.push("application answers");
  }

  if (fees.length || consents.length) {
    const lines = [
      `${user.name} — fee and consent record`,
      "",
      ...fees.flatMap((f) => [
        `Fee submission (${f.status})`,
        `  ${f.currency} ${f.amount} — ${f.feeType}`,
        `  University: ${f.university}`,
        `  Method: ${f.method}${f.txnRef ? ` · ref ${f.txnRef}` : ""}`,
        `  Declared by: ${f.signedName} on ${new Date(f.createdAt).toLocaleString()}`,
        f.reviewedAt ? `  Reviewed: ${new Date(f.reviewedAt).toLocaleString()}` : "",
        "",
      ]),
      ...consents.map(
        (c) =>
          `Consent (${c.kind}) v${c.version} — signed "${c.signedName}" on ${new Date(c.acceptedAt).toLocaleString()}`
      ),
    ].filter((l) => l !== undefined);

    const ok = await putFile(
      token,
      folder.id,
      `${prefix}_FEE_AND_CONSENT.txt`,
      Buffer.from(lines.join("\n"), "utf8"),
      "text/plain"
    );
    ok ? count++ : failures.push("fee and consent record");
  }

  /*
    The documents themselves, pulled back out of private storage and pushed
    across. Sequential rather than parallel: this runs inside a 30-second
    function, and a burst of concurrent uploads is the fastest way to be rate
    limited by Google and lose the lot.
  */
  for (const doc of documents) {
    if (!doc.storageKey) continue;
    try {
      const url = await getSignedUrl(doc.storageKey, 120, doc.storageProvider as never);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const safe = doc.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
      const ok = await putFile(
        token,
        folder.id,
        safe,
        bytes,
        doc.mimeType ?? "application/octet-stream"
      );
      ok ? count++ : failures.push(doc.name);
    } catch {
      failures.push(doc.name);
    }
  }

  /* -------------------------------------------------------------- share */

  let shared = false;
  if (recipient) {
    shared = await shareFolderWith(
      token,
      folder.id,
      recipient,
      `${user.name}'s application file from SnZ Ventures.`
    );
  }

  await recordExport({
    userId,
    folderId: folder.id,
    folderUrl: folder.url,
    exportedBy: session.userId,
    fileCount: count,
  });

  await audit({
    action: "drive.exported",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: userId,
    meta: { files: count, failed: failures, sharedWith: recipient || null, shared },
    ip,
  });

  return NextResponse.json({
    ok: true,
    folderUrl: folder.url,
    files: count,
    failed: failures,
    shared,
    // Said plainly rather than buried: a share that did not happen must not
    // look like one that did.
    shareError: recipient && !shared ? "The folder was created but sharing failed." : null,
  });
}

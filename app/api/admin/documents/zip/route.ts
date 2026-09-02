import { NextResponse } from "next/server";
import { apiRequireStaff, isAdmin, isStaff } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";
import * as store from "@/lib/db/repos/users";
import { getSignedUrl } from "@/lib/storage";
import { buildZip, safeEntryName, type ZipEntry } from "@/lib/zip";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { filenamePrefix } from "@/lib/application/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Well under the function's memory, and far past any real client file. */
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/**
 * ONE CLIENT'S DOCUMENTS, AS A SINGLE ARCHIVE.
 * ---------------------------------------------------------------------------
 * Staff were saving them one at a time: for a file with eleven documents that
 * is eleven clicks, eleven Save dialogs, and eleven chances to end up with
 * "download (3).pdf" and no idea which it is. The archive arrives named after
 * the client, with the documents named as they were uploaded.
 *
 * ADVISORS SEE ONLY THEIR OWN CLIENTS. The same scoping the single-document
 * route applies, applied here too — a bulk endpoint that forgot it would be a
 * way to read every client's passport through a button meant for convenience.
 *
 * IT IS AUDITED as one event naming the client, because downloading somebody's
 * entire identity file is a different act from opening one page of it.
 */
export async function GET(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Which client?" }, { status: 400 });
  }

  if (!rateLimit(`docs-zip:${session.userId}`, { limit: 20, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down a moment." }, { status: 429 });
  }

  /*
    An advisor may only reach a client assigned to them. Checked against
    staff_assignments, not inferred from the fact that a link was clickable.
  */
  if (!isAdmin(session.role) && isStaff(session.role)) {
    const mine = await repo.getAssignedClients(session.userId);
    if (!mine.some((c) => c.id === userId)) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
  }

  const [client, documents] = await Promise.all([
    store.findById(userId),
    repo.getDocumentsForOwner(userId),
  ]);
  if (!client) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const withFiles = documents.filter((d) => d.storageKey);
  if (!withFiles.length) {
    return NextResponse.json(
      { ok: false, error: "This client has not uploaded anything yet." },
      { status: 404 }
    );
  }

  /*
    Fetched one at a time rather than through Promise.all. This runs inside a
    thirty-second function against a rate-limited object store, and a burst of
    concurrent reads is the fastest way to be throttled and lose all of them
    instead of most.
  */
  const entries: ZipEntry[] = [];
  const taken = new Set<string>();
  const failed: string[] = [];
  let total = 0;

  for (const doc of withFiles) {
    if (total >= MAX_TOTAL_BYTES) {
      failed.push(`${doc.name} (archive full)`);
      continue;
    }
    try {
      const url = await getSignedUrl(doc.storageKey!, 120, doc.storageProvider as never);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const bytes = Buffer.from(await res.arrayBuffer());
      total += bytes.length;
      entries.push({ name: safeEntryName(doc.name, taken), data: bytes });
    } catch {
      failed.push(doc.name);
    }
  }

  if (!entries.length) {
    return NextResponse.json(
      { ok: false, error: "None of the files could be read from storage." },
      { status: 502 }
    );
  }

  /*
    A note inside the archive when anything was left out. A zip that quietly
    contains nine of eleven documents is worse than an error: it looks
    complete, and the two that are missing are the two nobody checks for.
  */
  if (failed.length) {
    entries.push({
      name: safeEntryName("MISSING — read me.txt", taken),
      data: Buffer.from(
        `These documents are on ${client.name}'s file but could not be added to this archive:\n\n` +
          failed.map((f) => `  - ${f}`).join("\n") +
          `\n\nOpen them individually from the portal.\n`,
        "utf8"
      ),
    });
  }

  const zip = buildZip(entries);
  const stem = filenamePrefix(
    client.name.split(" ").slice(-1)[0] ?? "",
    client.name.split(" ")[0] ?? ""
  );

  await audit({
    action: "document.bulk_downloaded",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: userId,
    meta: { files: entries.length, failed, bytes: zip.length },
    ip: clientIp(request),
  });

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      "Content-Disposition": `attachment; filename="${stem}_DOCUMENTS.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse, after } from "next/server";
import { apiRequireUser, isAdmin, isStaff } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { mirrorToDrive } from "@/lib/integrations/drive-mirror";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import {
  putObject,
  buildKey,
  validateUpload,
  isStorageConfigured,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

export const runtime = "nodejs";
// Uploads must not be cached or statically analysed.
export const dynamic = "force-dynamic";

/**
 * DOCUMENT UPLOAD
 * ---------------------------------------------------------------------------
 * A client may only ever upload against their OWN id — `owner_id` comes from
 * the verified session and is never read from the request. Files are validated
 * for size and MIME type, stored under an unguessable key in private object
 * storage, and are only ever retrieved through the authorised download route.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const ip = clientIp(request);
  if (!rateLimit(`upload:${session.userId}`, { limit: 20, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please wait a moment." },
      { status: 429 }
    );
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Secure document storage is not configured on this deployment, so uploads are disabled.",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const category = String(form.get("category") ?? "Other").slice(0, 60);
  const label = String(form.get("name") ?? "").slice(0, 120);

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
  }

  const invalid = validateUpload({ size: file.size, type: file.type, name: file.name });
  if (invalid) {
    return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Re-check after reading — Content-Length can lie.
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "Files must be 15 MB or smaller." }, { status: 413 });
  }

  try {
    const key = buildKey(session.userId, file.name);
    const stored = await putObject(key, buffer, file.type);

    const id = await repo.createDocument({
      storageProvider: stored.provider,
      ownerId: session.userId, // never from the request body
      name: label || file.name,
      category,
      storageKey: stored.key,
      mimeType: file.type,
      sizeBytes: buffer.length,
    });

    await audit({
      action: "document.uploaded",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "document",
      entityId: id,
      meta: { category, sizeBytes: buffer.length, mime: file.type },
      ip,
    });

    /*
      A copy into the firm's Drive, after the response.

      The student is told their upload succeeded the moment it is safe in
      storage — which it is, above. This runs behind that, so Google being slow
      or unreachable costs them nothing, and a failure here never turns into a
      failed upload. See lib/integrations/drive-mirror.
    */
    after(
      mirrorToDrive({
        userId: session.userId,
        studentName: session.name,
        studentEmail: session.email,
        fileName: label || file.name,
        bytes: buffer,
        mimeType: file.type,
      })
    );

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[documents] upload failed:", error);
    return NextResponse.json({ ok: false, error: "Upload failed." }, { status: 500 });
  }
}

/**
 * DOCUMENT REVIEW — staff only.
 * Advisors may only review documents belonging to a client assigned to them;
 * that check runs against the database, not the request.
 */
export async function PATCH(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!isStaff(session.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { documentId, status, note } = (body ?? {}) as Record<string, unknown>;
  const allowed = ["approved", "rejected", "needs_update"] as const;

  if (
    typeof documentId !== "string" ||
    typeof status !== "string" ||
    !allowed.includes(status as (typeof allowed)[number])
  ) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const doc = await repo.getDocumentById(documentId);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  if (!isAdmin(session.role)) {
    const clients = await repo.getAssignedClients(session.userId);
    if (!clients.some((c) => c.id === doc.ownerId)) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
  }

  await repo.reviewDocument(
    documentId,
    status as (typeof allowed)[number],
    session.userId,
    typeof note === "string" ? note.slice(0, 500) : null
  );

  await repo.notify({
    userId: doc.ownerId,
    title:
      status === "approved"
        ? `${doc.name} approved`
        : `${doc.name} needs attention`,
    body: typeof note === "string" ? note.slice(0, 300) : undefined,
    href: "/portal/documents",
  });

  await audit({
    action: "document.reviewed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "document",
    entityId: documentId,
    meta: { status },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

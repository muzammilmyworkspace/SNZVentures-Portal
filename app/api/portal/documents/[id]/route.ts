import { NextResponse } from "next/server";
import { apiRequireUser, isAdmin, isStaff } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { getSignedUrl, deleteObject } from "@/lib/storage";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AUTHORISED DOWNLOAD.
 *
 * The storage key is never exposed to the browser. This route checks who is
 * asking, mints a signed URL valid for ~2 minutes, records the access, and
 * redirects. A leaked link therefore expires almost immediately and is
 * attributable in the audit log.
 */
async function authorise(documentId: string, viewerId: string, role: string) {
  const doc = await repo.getDocumentById(documentId);
  if (!doc) return { doc: null, allowed: false };

  if (doc.ownerId === viewerId) return { doc, allowed: true };
  if (isAdmin(role as never)) return { doc, allowed: true };

  if (isStaff(role as never)) {
    const clients = await repo.getAssignedClients(viewerId);
    return { doc, allowed: clients.some((c) => c.id === doc.ownerId) };
  }
  return { doc, allowed: false };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await params;
  const { doc, allowed } = await authorise(id, session.userId, session.role);

  // Same response for "not found" and "not yours" — no existence oracle.
  if (!doc || !allowed || !doc.storageKey) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  try {
    /*
      ?download=1 asks the store to send it as an attachment rather than
      letting the browser display it. Same authorisation, same short-lived
      link — the only difference is what the browser does on arrival.
    */
    const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
    const url = await getSignedUrl(
      doc.storageKey,
      120,
      doc.storageProvider as never,
      wantsDownload ? doc.name : undefined
    );
    await audit({
      action: "document.downloaded",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "document",
      entityId: id,
      ip: clientIp(request),
    });
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[documents] signing failed:", error);
    return NextResponse.json({ ok: false, error: "Unavailable." }, { status: 503 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await params;
  const { doc, allowed } = await authorise(id, session.userId, session.role);
  if (!doc || !allowed) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  // An approved document is part of the case record — only staff may remove it.
  if (doc.status === "approved" && !isStaff(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Approved documents can only be removed by your advisor." },
      { status: 403 }
    );
  }

  try {
    if (doc.storageKey) await deleteObject(doc.storageKey, doc.storageProvider as never);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[documents] object delete failed:", error);
  }

  await repo.deleteDocument(id);
  await audit({
    action: "document.deleted",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "document",
    entityId: id,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

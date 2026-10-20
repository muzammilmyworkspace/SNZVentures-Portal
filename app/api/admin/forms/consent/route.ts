import { NextResponse } from "next/server";
import { apiRequireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import {
  createDraft,
  updateDraft,
  publishDraft,
  setActive,
  deleteTemplate,
  getTemplate,
  type ConsentCategory,
} from "@/lib/db/repos/consent-templates";
import { putObject, buildKey, validateUpload, isStorageConfigured, deleteObject } from "@/lib/storage";
import { extractText, EXTRACTABLE } from "@/lib/portal/extract-text";
import type { Session } from "@/lib/auth/types";

/**
 * CONSENT DOCUMENTS: create, edit, publish, switch on/off, delete.
 *
 * One POST (multipart) with an `action`:
 *   create      new draft from typed text, or from an uploaded PDF / .docx
 *               whose text becomes the draft (the file is kept alongside
 *               when storage is set up). `publish=1` publishes it at once.
 *   update      change a draft: title, text, logo
 *   publish     a draft becomes the one in use
 *   edit        copy a published version into a new draft
 *   activate / deactivate   put a published version in or out of use
 *   delete      a draft, or a published version nobody has signed
 *
 * WHO: the super admin manages SnZ Ventures' own (student, consultant); a
 * consultant manages only their own consent for their students. Nobody else.
 */

const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** May this person manage this category, and as which owner? */
function scope(session: Session, category: unknown): { category: ConsentCategory; ownerId: string | null } | null {
  if (session.impersonator) return null;
  if (session.role === "super_admin" && (category === "student" || category === "consultant")) {
    return { category, ownerId: null };
  }
  if (session.role === "advisor" && category === "consultant_student") {
    return { category, ownerId: session.userId };
  }
  return null;
}

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

async function logoFrom(form: FormData): Promise<{ data: Buffer; type: string } | null | "invalid"> {
  const f = form.get("logo");
  if (!(f instanceof File) || f.size === 0) return null;
  if (!LOGO_TYPES.includes(f.type) || f.size > 512 * 1024) return "invalid";
  return { data: Buffer.from(await f.arrayBuffer()), type: f.type };
}

export async function POST(request: Request) {
  const guard = await apiRequireRole(["super_admin", "advisor"]);
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (!rateLimit(`consent:${session.userId}`, { limit: 80, windowMs: 10 * 60_000 }).ok) {
    return bad("Slow down a moment.", 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Invalid request.");
  }
  const action = String(form.get("action") ?? "");
  const ip = clientIp(request);
  const log = (what: string, entityId: string, meta: Record<string, unknown> = {}) =>
    audit({
      action: what === "publish" || what === "create-published" ? "form.consent_published" : "form.consent_current",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "consent_template",
      entityId,
      meta: { step: what, ...meta },
      ip,
    });

  /* ------------------------------------------------------------ create */
  if (action === "create") {
    const s = scope(session, form.get("category"));
    if (!s) return bad("You cannot change this consent.", 403);

    let title = String(form.get("title") ?? "").trim().slice(0, 160);
    let body = String(form.get("body") ?? "").trim().slice(0, 30000);
    const file = form.get("file");
    const hasFile = file instanceof File && file.size > 0;
    let stored: { key: string; name: string; type: string; provider: string } | null = null;

    if (hasFile) {
      const f = file as File;
      if (!DOC_TYPES.includes(f.type)) return bad("Upload a PDF or a Word file.");
      const invalid = validateUpload({ size: f.size, type: f.type, name: f.name });
      if (invalid) return bad(invalid);
      const buffer = Buffer.from(await f.arrayBuffer());
      if (!EXTRACTABLE.includes(f.type)) {
        return bad("This is an old .doc file. Save it as .docx or PDF and upload that.");
      }
      try {
        const text = await extractText({ type: f.type, name: f.name, buffer });
        if (!body) body = text;
      } catch (e) {
        return bad(e instanceof Error ? e.message : "The text could not be read from that file.");
      }
      if (!body) {
        return bad("No text could be read from that file (a scanned image?). Type the consent instead.");
      }
      if (!title) title = f.name.replace(/\.(pdf|docx)$/i, "").slice(0, 160);
      // The original file is kept beside the text when there is storage for it.
      if (isStorageConfigured()) {
        try {
          const put = await putObject(buildKey("consent", f.name), buffer, f.type);
          stored = { key: put.key, name: f.name.slice(0, 200), type: f.type, provider: put.provider };
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("[consent] original file not stored", error);
        }
      }
    }

    if (title.length < 3) return bad("Give the consent a title.");
    if (body.length < 20) return bad("Write the consent text (at least a sentence).");

    const logo = await logoFrom(form);
    if (logo === "invalid") return bad("The logo must be a PNG, JPG or WebP image, up to 512 KB.");

    const draft = await createDraft({
      category: s.category,
      ownerId: s.ownerId,
      title,
      body,
      file: stored,
      logo: logo ?? (form.get("keepLogo") === "1" ? "keep" : null),
      createdBy: session.userId,
    });
    if (!draft) return bad("That didn't save.", 503);
    if (form.get("publish") === "1") {
      await publishDraft(draft.id);
      await log("create-published", draft.id, { category: s.category, version: draft.version });
    } else {
      await log("draft", draft.id, { category: s.category, version: draft.version, fromFile: hasFile });
    }
    return NextResponse.json({ ok: true, id: draft.id, extracted: hasFile });
  }

  /* ---------------------------------------- actions on one version */
  const id = String(form.get("id") ?? "");
  const t = await getTemplate(id);
  if (!t) return bad("That version no longer exists.", 404);
  const s = scope(session, t.category);
  if (!s || s.ownerId !== t.ownerId) return bad("You cannot change this consent.", 403);

  if (action === "update") {
    if (t.status !== "draft") return bad("A published version cannot be changed. Use Edit to make a new draft from it.");
    const title = String(form.get("title") ?? "").trim().slice(0, 160);
    const body = String(form.get("body") ?? "").trim().slice(0, 30000);
    if (title.length < 3) return bad("Give the consent a title.");
    if (body.length < 20) return bad("Write the consent text (at least a sentence).");
    const logo = await logoFrom(form);
    if (logo === "invalid") return bad("The logo must be a PNG, JPG or WebP image, up to 512 KB.");
    const ok = await updateDraft(id, {
      title,
      body,
      ...(logo ? { logo } : form.get("removeLogo") === "1" ? { logo: null } : {}),
    });
    if (!ok) return bad("That didn't save.", 503);
    if (form.get("publish") === "1") {
      await publishDraft(id);
      await log("publish", id, { category: t.category, version: t.version });
    }
    return NextResponse.json({ ok: true, id });
  }

  if (action === "publish") {
    if (t.status !== "draft") return bad("Already published.");
    if (!(await publishDraft(id))) return bad("That didn't save.", 503);
    await log("publish", id, { category: t.category, version: t.version });
    return NextResponse.json({ ok: true, id });
  }

  if (action === "edit") {
    const draft = await createDraft({
      category: t.category,
      ownerId: t.ownerId,
      title: t.title,
      body: t.body ?? "",
      file: null,
      logo: "keep",
      logoFrom: t.id,
      createdBy: session.userId,
    });
    if (!draft) return bad("That didn't save.", 503);
    await log("draft", draft.id, { category: t.category, copiedFrom: t.version });
    return NextResponse.json({ ok: true, id: draft.id });
  }

  if (action === "activate" || action === "deactivate") {
    if (t.status !== "published") return bad("Publish the draft first.");
    if (!(await setActive(id, action === "activate"))) return bad("That didn't save.", 503);
    await log(action, id, { category: t.category, version: t.version });
    return NextResponse.json({ ok: true, id });
  }

  if (action === "delete") {
    const r = await deleteTemplate(id);
    if (!r.ok) return bad(r.reason ?? "That didn't delete.", 409);
    if (r.fileKey) await deleteObject(r.fileKey, r.fileProvider as never).catch(() => undefined);
    await log("delete", id, { category: t.category, version: t.version });
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action.");
}

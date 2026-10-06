import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import { createConsentTemplate, setCurrentConsent } from "@/lib/db/repos/forms";
import { putObject, buildKey, validateUpload, isStorageConfigured } from "@/lib/storage";

/**
 * THE CONSENT STUDENTS SIGN. Super admin only.
 *
 * POST publishes a new version (typed text, a PDF / Word file, or both) and
 * makes it the one students sign from now on. PATCH switches the current
 * version, or back to the built-in wording with `{ id: null }`. Versions are
 * never edited, so every signature keeps pointing at what was read.
 */

const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim().slice(0, 160);
  const body = String(form.get("body") ?? "").trim().slice(0, 30000);
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (title.length < 3) return NextResponse.json({ ok: false, error: "Give the consent a title." }, { status: 400 });
  if (!body && !hasFile) {
    return NextResponse.json({ ok: false, error: "Type the consent text or upload the document." }, { status: 400 });
  }
  if (body && body.length < 20) {
    return NextResponse.json({ ok: false, error: "The consent text is too short." }, { status: 400 });
  }

  let stored: { key: string; name: string; type: string; provider: string } | null = null;
  if (hasFile) {
    const f = file as File;
    if (!DOC_TYPES.includes(f.type)) {
      return NextResponse.json({ ok: false, error: "Upload a PDF or Word document." }, { status: 400 });
    }
    const invalid = validateUpload({ size: f.size, type: f.type, name: f.name });
    if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
    if (!isStorageConfigured()) {
      return NextResponse.json(
        { ok: false, error: "File storage is not set up, so documents cannot be uploaded. Type the text instead." },
        { status: 503 }
      );
    }
    try {
      const put = await putObject(buildKey("consent", f.name), Buffer.from(await f.arrayBuffer()), f.type);
      stored = { key: put.key, name: f.name.slice(0, 200), type: f.type, provider: put.provider };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[consent] upload failed", error);
      return NextResponse.json({ ok: false, error: "The document could not be uploaded. Try again." }, { status: 502 });
    }
  }

  /*
    THE LOGO. Small images only, kept in the row so it works without file
    storage. No SVG: it can carry script, and this is served to every account.
    "keep" carries the logo of the version in use over to the new one.
  */
  let logo: { data: Buffer; type: string } | "keep" | null = form.get("keepLogo") === "1" ? "keep" : null;
  const logoFile = form.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(logoFile.type)) {
      return NextResponse.json({ ok: false, error: "The logo must be a PNG, JPG or WebP image." }, { status: 400 });
    }
    if (logoFile.size > 512 * 1024) {
      return NextResponse.json({ ok: false, error: "The logo must be 512 KB or smaller." }, { status: 400 });
    }
    logo = { data: Buffer.from(await logoFile.arrayBuffer()), type: logoFile.type };
  }

  const template = await createConsentTemplate({
    title,
    body: body || null,
    file: stored,
    logo,
    createdBy: session.userId,
  });
  if (!template) return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 503 });

  await audit({
    action: "form.consent_published",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "consent_template",
    entityId: template.id,
    meta: { version: template.version, title, file: stored?.name ?? null, logo: template.hasLogo },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, id: template.id, version: template.version });
}

export async function PATCH(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const body = (await request.json().catch(() => null)) as { id?: string | null } | null;
  if (!body || !("id" in body)) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const id = body.id ? String(body.id) : null;
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Unknown version." }, { status: 400 });
  }

  const ok = await setCurrentConsent(id);
  if (!ok) return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 404 });

  await audit({
    action: "form.consent_current",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "consent_template",
    entityId: id ?? undefined,
    meta: { builtIn: id === null },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

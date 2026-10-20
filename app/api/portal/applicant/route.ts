import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import * as repo from "@/lib/db/repos/portal";
import { applicationFor, saveApplication, moveApplication } from "@/lib/db/repos/consultant-applications";
import { currentTemplate, templateVersion } from "@/lib/db/repos/consent-templates";
import { recordConsent } from "@/lib/db/repos/consents";
import { putObject, buildKey, validateUpload, isStorageConfigured, MAX_UPLOAD_BYTES } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A CONSULTANT APPLICANT'S OWN APPLICATION.
 *
 * One POST (multipart) with an `action`:
 *   save / submit   details and company documents; submit sends it to the
 *                   super admin (only while it is a draft, or was rejected)
 *   remove_doc      take back a company document before submitting
 *   sign            sign the SnZ Ventures <-> consultant consent, once the
 *                   super admin has sent it
 *
 * Only the applicant themselves, never a view-as.
 */

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
const DOC_CATEGORY = "Company document";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return bad("Not signed in.", 401);
  if (session.role !== "applicant" || session.impersonator) return bad("This is for consultant applicants.", 403);
  if (!rateLimit(`applicant:${session.userId}`, { limit: 60, windowMs: 10 * 60_000 }).ok) return bad("Slow down a moment.", 429);

  const app = await applicationFor(session.userId);
  if (!app) return bad("The portal database is not available.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Invalid request.");
  }
  const action = String(form.get("action") ?? "");
  const ip = clientIp(request);
  const editable = app.status === "draft" || app.status === "rejected";

  /* ---------------------------------------------------- details, docs */
  if (action === "save" || action === "submit") {
    if (!editable) return bad("Your application has been sent, so it cannot be changed now.");
    const text = (k: string, n = 200) => String(form.get(k) ?? "").trim().slice(0, n);
    const details = {
      phone: text("phone", 40),
      address: text("address", 300),
      city: text("city", 80),
      country: text("country", 80),
      companyName: text("companyName", 160),
      companyRegistered: form.get("companyRegistered") === "yes",
      registrationNo: text("registrationNo", 80) || null,
      website: text("website", 200) || null,
      about: text("about", 2000) || null,
    };

    // Files first: an upload that fails must not leave a submitted application without them.
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) {
      if (!isStorageConfigured()) return bad("File storage is not set up, so documents cannot be uploaded right now.", 503);
      if (files.length + app.documents.length > 10) return bad("Up to 10 documents.");
      for (const f of files) {
        const invalid = validateUpload({ size: f.size, type: f.type, name: f.name });
        if (invalid) return bad(`${f.name}: ${invalid}`);
      }
      for (const f of files) {
        const buffer = Buffer.from(await f.arrayBuffer());
        if (buffer.length > MAX_UPLOAD_BYTES) return bad(`${f.name}: files must be 15 MB or smaller.`);
        const stored = await putObject(buildKey(session.userId, f.name), buffer, f.type);
        const id = await repo.createDocument({
          storageProvider: stored.provider,
          ownerId: session.userId,
          name: f.name.slice(0, 120),
          category: DOC_CATEGORY,
          storageKey: stored.key,
          mimeType: f.type,
          sizeBytes: buffer.length,
        });
        await audit({
          action: "document.uploaded",
          actorId: session.userId,
          actorEmail: session.email,
          entity: "document",
          entityId: id,
          meta: { category: DOC_CATEGORY },
          ip,
        });
      }
    }

    const submit = action === "submit";
    if (submit) {
      const missing = [
        ["phone", "your phone number"],
        ["address", "your address"],
        ["city", "your city"],
        ["country", "your country"],
        ["companyName", "your company name"],
      ].filter(([k]) => !details[k as keyof typeof details]);
      if (missing.length) return bad(`Enter ${missing.map(([, l]) => l).join(", ")}.`);
      if (form.get("companyRegistered") !== "yes" && form.get("companyRegistered") !== "no") {
        return bad("Say whether your company is registered.");
      }
      const docCount = app.documents.length + files.length;
      if (details.companyRegistered && docCount === 0 && isStorageConfigured()) {
        return bad("Upload your company registration documents.");
      }
    }

    if (!(await saveApplication(session.userId, details, submit))) return bad("That didn't save.", 503);

    if (submit) {
      await audit({
        action: "consultant.applied",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: session.userId,
        meta: { company: details.companyName, registered: details.companyRegistered },
        ip,
      });
      await repo.notifyStaff({
        title: `${session.name} applied to be a consultant`,
        body: details.companyName,
        href: `/portal/admin/consultant-applications?view=${session.userId}`,
        kind: "task",
        area: "consultants",
        actorId: session.userId,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_doc") {
    if (!editable) return bad("Your application has been sent, so it cannot be changed now.");
    const id = String(form.get("id") ?? "");
    if (!app.documents.some((d) => d.id === id)) return bad("Not found.", 404);
    await repo.deleteDocument(id);
    return NextResponse.json({ ok: true });
  }

  /* ---------------------------------------------------------- consent */
  if (action === "sign") {
    if (app.status !== "consent_sent") return bad("There is nothing to sign right now.");
    const t = await currentTemplate("consultant", null);
    if (!t) return bad("The consent is not available right now. We will send it again.", 409);
    if (String(form.get("id") ?? "") !== t.id) return bad("The consent has just changed. Reload the page and read the new one.", 409);
    const signedName = String(form.get("signedName") ?? "").trim();
    if (form.get("agree") !== "1" || signedName.length < 2) return bad("Tick the box and type your name to sign.");
    const version = templateVersion(t);
    const ok = await recordConsent({
      userId: session.userId,
      kind: "consultant_agreement",
      version,
      signedName,
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    if (!ok) return bad("We could not record your signature. Please try again.", 503);
    await moveApplication(session.userId, "consent_signed", ["consent_sent"]);
    await audit({
      action: "consent.accepted",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "user",
      entityId: session.userId,
      meta: { kind: "consultant_agreement", version, at: "consultant_application" },
      ip,
    });
    await repo.notifyStaff({
      title: `${session.name} signed the consultant consent`,
      body: "Ready for your final approval.",
      href: `/portal/admin/consultant-applications?view=${session.userId}`,
      kind: "task",
      area: "consultants",
      actorId: session.userId,
    });
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action.");
}

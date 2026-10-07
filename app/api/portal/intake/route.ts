import { loadIntake, activeConsent, partnerConsentFor } from "@/lib/portal/forms";
import { NextResponse, after } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import * as ops from "@/lib/db/repos/operations";
import * as repo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { PATHWAY_FOR_ROLE, validateStep, documentsComplete } from "@/lib/portal/intake";
import { documentsFor } from "@/lib/application/documents";
import { recordConsent } from "@/lib/db/repos/consents";
import { apiRequireOpen } from "@/lib/portal/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * INTAKE FORMS — the multi-step admission / career / business questionnaires.
 *
 * THE PATHWAY IS NOT ACCEPTED FROM THE REQUEST. It is derived from the signed
 * session role, so a student cannot post themselves a business intake and land
 * in the wrong operational queue.
 *
 * Answers are whitelisted against the step definition on the server. Anything
 * the form did not ask for is dropped rather than merged into the JSONB, so a
 * crafted body cannot stuff arbitrary keys into a record staff will read.
 */

function pathwayFor(role: string) {
  return PATHWAY_FOR_ROLE[role as keyof typeof PATHWAY_FOR_ROLE] ?? null;
}

export async function GET() {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;

  const pathway = pathwayFor(guard.session.role);
  if (!pathway) {
    return NextResponse.json(
      { ok: false, error: "This account type has no intake form." },
      { status: 400 }
    );
  }

  const form = await ops.getIntake(guard.session.userId, pathway);
  return NextResponse.json({ ok: true, pathway, form });
}

/** Save & continue. Never completes the form — that is POST. */
export async function PUT(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  {
    const locked = await apiRequireOpen(guard.session, "/portal/application");
    if (locked) return locked;
  }
  const { session } = guard;

  const pathway = pathwayFor(session.role);
  if (!pathway) {
    return NextResponse.json(
      { ok: false, error: "This account type has no intake form." },
      { status: 400 }
    );
  }

  if (!rateLimit(`intake:${session.userId}`, { limit: 90, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many saves." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { step, answers, resumeAt } = (body ?? {}) as Record<string, unknown>;
  const steps = (await loadIntake(pathway)).steps;
  const index = Number(step);

  if (!Number.isInteger(index) || index < 0 || index >= steps.length) {
    return NextResponse.json({ ok: false, error: "Unknown step." }, { status: 400 });
  }
  if (typeof answers !== "object" || answers === null) {
    return NextResponse.json({ ok: false, error: "Invalid answers." }, { status: 400 });
  }

  // Whitelist + coerce. Drafts do NOT enforce required fields — a half-filled
  // step is the entire point of saving a draft.
  const { clean } = validateStep(steps[index], answers as Record<string, unknown>, {
    requireAll: false,
  });

  /*
    TWO DIFFERENT NUMBERS, and conflating them caused a real bug.

    `step` is WHICH STEP THESE ANSWERS BELONG TO — it selects the field list
    they are validated against, so it must always be the step on screen.

    `resumeAt` is WHERE TO REOPEN THE FORM. "Save & continue" sends the next
    step because this one is done; "Save as draft" sends the current one,
    because the person is still on it. Deriving the resume point from `step`
    meant a draft save quietly advanced them, and the form reopened a step
    ahead with their answers apparently gone. They were not gone — they were
    one step back, on a page the form had skipped.
  */
  const resume = Number.isInteger(Number(resumeAt))
    ? Math.min(Math.max(Number(resumeAt), 0), steps.length - 1)
    : index;

  /*
    WHAT CHANGED, when the form had been sent back for corrections. Read
    before the save so the old answers are still there to compare with. Only
    field NAMES are recorded, never the values: the answers include passport
    and financial details that have no business in a log.
  */
  const before = await ops.getIntake(session.userId, pathway);
  const changed =
    before?.status === "returned"
      ? steps[index].fields
          .filter((f) => f.key in clean && JSON.stringify(clean[f.key] ?? null) !== JSON.stringify(before.data[f.key] ?? null))
          .map((f) => f.label)
      : [];

  const form = await ops.saveIntakeDraft({
    userId: session.userId,
    pathway,
    step: resume,
    data: clean,
  });

  if (form && changed.length) {
    await audit({
      action: "intake.edited",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "intake",
      entityId: form.id,
      meta: { step: steps[index].title, fields: changed.slice(0, 40) },
      ip: clientIp(request),
    });
  }

  if (!form) {
    return NextResponse.json(
      { ok: false, error: "This form has already been submitted and can no longer be edited." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, form });
}

/** Final submit. Validates every step, not just the last one. */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  {
    const locked = await apiRequireOpen(guard.session, "/portal/application");
    if (locked) return locked;
  }
  const { session } = guard;

  const pathway = pathwayFor(session.role);
  if (!pathway) {
    return NextResponse.json(
      { ok: false, error: "This account type has no intake form." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { answers } = (body ?? {}) as Record<string, unknown>;
  const incoming = (typeof answers === "object" && answers ? answers : {}) as Record<
    string,
    unknown
  >;

  const existing = await ops.getIntake(session.userId, pathway);
  // A form sent back by staff ("returned") is open again for corrections.
  if (existing && existing.status !== "draft" && existing.status !== "returned") {
    return NextResponse.json(
      { ok: false, error: "This form has already been submitted." },
      { status: 409 }
    );
  }

  // Merge what was already saved with what the final step is posting, then
  // check the WHOLE form. Validating only the last step would let someone
  // submit with steps 1–8 empty by jumping straight to step 9.
  const merged = { ...(existing?.data ?? {}), ...incoming };
  const definition = (await loadIntake(pathway));
  const missing: { step: number; label: string }[] = [];
  const clean: Record<string, unknown> = {};

  definition.steps.forEach((s, i) => {
    const result = validateStep(s, merged, { requireAll: true });
    Object.assign(clean, result.clean);
    result.missing.forEach((label) => missing.push({ step: i, label }));
  });

  /*
    REQUIRED DOCUMENTS. Which slots are required depends on the study level
    (another step), so validateStep cannot judge them; the whole form can.
    Without this a form whose documents step was marked required still went
    through with none attached.
  */
  definition.steps.forEach((s, i) => {
    const docs = s.fields.find((f) => f.type === "documents" && f.required);
    if (docs && !documentsComplete(merged)) {
      const held = (merged.documents ?? {}) as Record<string, unknown>;
      for (const slot of documentsFor(String(merged.applyLevel ?? "")).filter((d) => d.required && !held[d.key])) {
        missing.push({ step: i, label: `Document: ${slot.title}` });
      }
    }
  });

  if (missing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Some required answers are still missing.",
        missing,
      },
      { status: 422 }
    );
  }

  /*
    The case gets a title from the definition and, where the applicant named
    countries, the first one they chose. Not invented: if they picked none, the
    case simply has no country rather than a guessed one.
  */
  const chosen = Array.isArray(clean.countries) ? (clean.countries as string[]) : [];
  const country = chosen.find((c) => c && c !== "Open to advice") ?? null;

  /*
    THE UNDERTAKING IS RECORDED BEFORE THE FORM IS SUBMITTED, NOT AFTER.

    It is what authorises us to send this file to universities and immigration
    authorities. Submitting first would leave a completed application sitting
    in the staff queue that nobody is yet permitted to act on — and if the
    consent write then failed, that state would be permanent and invisible.

    This ordering cannot produce a submitted application with no consent. The
    reverse can, and the failure is silent.

    Its own version comes from the SERVER's constant, never from the request: a
    browser must not be able to claim it agreed to a different document, or an
    older one, than the one it was shown. Duplicate acceptances of the same
    version are dropped by the unique constraint, so a retry after a failed
    submit is safe.
  */
  if (pathway === "study") {
    const signature = String(clean.undertakingSignature ?? "").trim();
    if (clean.undertakingAccepted !== true || signature.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Read the Student Consent & Undertaking, tick the box and type your name as your signature. Nothing is submitted without it.",
          missing: [{ step: definition.steps.length - 1, label: "Consent & undertaking" }],
        },
        { status: 422 }
      );
    }

    // The version of the consent on screen today: the one written by the
    // super admin if there is one, else the built-in wording.
    const consentVersion = (await activeConsent()).version;
    const recorded = await recordConsent({
      userId: session.userId,
      version: consentVersion,
      signedName: signature,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!recorded) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "We could not record your signature just now, so nothing was submitted. Please try again.",
        },
        { status: 503 }
      );
    }

    await audit({
      action: "consent.accepted",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "user",
      entityId: session.userId,
      meta: { kind: "student_undertaking", version: consentVersion, at: "application_submit" },
      ip: clientIp(request),
    });

    /*
      THE CONSULTANT'S OWN CONSENT, when the student came through one who has
      one in use. Shown on the same step and signed by the same tick and name;
      recorded before the submit for the same reason as SnZ's.
    */
    const partner = await partnerConsentFor(session.userId);
    if (partner) {
      const partnerRecorded = await recordConsent({
        userId: session.userId,
        kind: "consultant_student",
        version: partner.version,
        signedName: signature,
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      });
      if (!partnerRecorded) {
        return NextResponse.json(
          { ok: false, error: "We could not record your signature just now, so nothing was submitted. Please try again." },
          { status: 503 }
        );
      }
      await audit({
        action: "consent.accepted",
        actorId: session.userId,
        actorEmail: session.email,
        entity: "user",
        entityId: session.userId,
        meta: { kind: "consultant_student", version: partner.version, consultant: partner.consultantId, at: "application_submit" },
        ip: clientIp(request),
      });
    }
  }

  const form = await ops.submitIntake({
    userId: session.userId,
    pathway,
    data: clean,
    title: definition.title,
    country,
  });
  if (!form) {
    /*
      Reaching here means no DRAFT matched — the form was never started, or it
      has already been submitted. "Please try again" was the message, and
      retrying cannot possibly help with either cause; it just sends someone
      round the same loop until they give up and email instead.
    */
    return NextResponse.json(
      {
        ok: false,
        error:
          "We couldn't find an open form to submit. It may already have been sent — open your application to check.",
      },
      { status: 409 }
    );
  }

  await ops.recordStatus({
    entity: "application",
    entityId: form.id,
    subjectId: session.userId,
    fromStatus: existing?.status ?? null,
    toStatus: "submitted",
    note:
      existing?.status === "returned"
        ? `${definition.title} sent again with the requested changes.`
        : `${definition.title} submitted.`,
    actorId: session.userId,
  });

  /*
    The one event on this page staff most need to know about: a file that is
    ready to be read, rather than one still being typed.
  */
  after(
    repo.notifyStaff({
      area: "applications",
      // The category is in the title: a student, a job seeker or a business.
      title: `${session.name} (${pathway === "study" ? "Student" : pathway === "career" ? "Job Seeker" : "Business"}) submitted their ${pathway === "study" ? "application" : pathway === "career" ? "career profile" : "company profile"}`,
      body: pathway === "study" ? "Signed and complete — ready to review." : "Complete — ready to review.",
      href: `/portal/admin/requests?review=${form.id}`,
      kind: "status",
      aboutUserId: session.userId,
      actorId: session.userId,
    })
  );

  await repo.notify({
    userId: session.userId,
    title: "Your application has been received",
    body: "We'll review it and come back to you with the next step.",
    href: "/portal/journey",
    kind: "status",
  });

  await audit({
    action: "intake.submitted",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "intake",
    entityId: form.id,
    // Field COUNT only. The answers include passport and financial details and
    // have no business being duplicated into an audit log.
    meta: { pathway, fields: Object.keys(clean).length },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, form });
}

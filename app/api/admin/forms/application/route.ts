import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import { saveFormOverride, resetFormOverride } from "@/lib/db/repos/forms";
import { cleanDefinition } from "@/lib/portal/forms";

/**
 * THE APPLICATION FORM, as the super admin edits it.
 *
 * PUT saves the whole form; DELETE goes back to the original. Answers already
 * given are kept either way: a removed question's answer stays in the
 * student's saved data, it is just no longer asked.
 */

const PATHWAYS = ["study", "career", "business"] as const;
type Pathway = (typeof PATHWAYS)[number];
const isPathway = (v: unknown): v is Pathway => PATHWAYS.includes(v as Pathway);

export async function PUT(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const text = await request.text();
  if (text.length > 600_000) return NextResponse.json({ ok: false, error: "The form is too large." }, { status: 413 });
  let body: { pathway?: unknown; definition?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (!isPathway(body.pathway)) return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });

  let definition;
  try {
    definition = cleanDefinition(body.pathway, body.definition);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "The form is not valid." },
      { status: 422 }
    );
  }

  const ok = await saveFormOverride(body.pathway, definition, session.userId);
  if (!ok) return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 503 });

  await audit({
    action: "form.application_saved",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "form",
    entityId: body.pathway,
    meta: {
      steps: definition.steps.length,
      fields: definition.steps.reduce((n, s) => n + s.fields.length, 0),
    },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const pathway = new URL(request.url).searchParams.get("pathway");
  if (!isPathway(pathway)) return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });
  const ok = await resetFormOverride(pathway);
  if (!ok) return NextResponse.json({ ok: false, error: "That didn't save." }, { status: 503 });

  await audit({
    action: "form.application_reset",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "form",
    entityId: pathway,
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

import { intakeFor } from "@/lib/portal/intake";
import type { IntakeDefinition, IntakeField, IntakeStep, FieldType } from "@/lib/application/types";
import { getFormOverride, currentConsentTemplate, templateVersion } from "@/lib/db/repos/forms";
import { CONSENT_VERSION, CONSENT_TITLE } from "@/lib/portal/consent";
import { LOCKED_KEYS } from "@/lib/portal/form-rules";

/**
 * THE FORMS AS THEY ARE TODAY, on the server.
 *
 * A super admin can replace the application form and the consent from the
 * portal. These read what they saved and fall back to the versions written in
 * code, so nothing changes until somebody changes it.
 */

type Pathway = IntakeDefinition["pathway"];

/** The application form in force: the edited one if saved, else the original. */
export async function loadIntake(pathway: Pathway): Promise<IntakeDefinition> {
  const saved = await getFormOverride(pathway);
  return saved?.definition?.steps?.length ? saved.definition : intakeFor(pathway);
}

/** The consent a student is shown and signs. */
export type ConsentView = {
  title: string;
  /** Stored against each signature. */
  version: string;
  /** Typed text; null means the built-in wording, or a document only. */
  body: string | null;
  fileUrl: string | null;
  fileName: string | null;
  logoUrl: string | null;
  custom: boolean;
};

export async function activeConsent(): Promise<ConsentView> {
  const t = await currentConsentTemplate();
  if (!t) {
    return { title: CONSENT_TITLE, version: CONSENT_VERSION, body: null, fileUrl: null, fileName: null, logoUrl: null, custom: false };
  }
  return {
    title: t.title,
    version: templateVersion(t),
    body: t.body,
    fileUrl: t.fileKey ? `/api/portal/consent-file/${t.id}` : null,
    fileName: t.fileName,
    logoUrl: t.hasLogo ? `/api/portal/consent-logo/${t.id}` : null,
    custom: true,
  };
}

/* --------------------------------------------------------- form checking */

const TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  "text", "email", "tel", "date", "number", "select", "multiselect", "textarea", "radio",
  "checkbox", "repeater", "note", "documents", "derived", "review", "consent", "checklist",
]);


const KEY = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

function cleanField(raw: unknown, seen: Set<string>, path: string): IntakeField {
  const f = (raw ?? {}) as Record<string, unknown>;
  const key = String(f.key ?? "");
  if (!KEY.test(key)) throw new Error(`${path}: field key "${key}" is not valid.`);
  if (seen.has(key)) throw new Error(`Two fields share the key "${key}".`);
  seen.add(key);
  const type = String(f.type) as FieldType;
  if (!TYPES.has(type)) throw new Error(`${path}: unknown field type "${type}".`);
  const label = str(f.label, 300) ?? "";
  if (!label.trim() && !["note", "consent", "review", "checklist", "derived", "documents"].includes(type)) {
    throw new Error(`${path}: every question needs a label.`);
  }

  const out: IntakeField = { key, label, type };
  const copyStr = ["placeholder", "hint", "itemLabel", "body", "dateMin", "dateMax", "mustMatch", "defaultValue"] as const;
  for (const k of copyStr) {
    const v = str(f[k], k === "body" ? 4000 : 600);
    if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  for (const k of ["required", "wide", "countWords"] as const) if (f[k] === true) out[k] = true;
  for (const k of ["max", "rows", "minItems", "maxItems"] as const) {
    const n = Number(f[k]);
    if (f[k] !== undefined && f[k] !== null && Number.isFinite(n) && n >= 0 && n <= 100000) out[k] = Math.floor(n);
  }
  if (f.source === "countries" || f.source === "languages") out.source = f.source;
  if (f.mask === "cnic" || f.mask === "upper") out.mask = f.mask;
  if (f.tone === "info" || f.tone === "warn") out.tone = f.tone;
  if (Array.isArray(f.options)) {
    out.options = f.options.map((o) => String(o).trim().slice(0, 200)).filter(Boolean).slice(0, 300);
  }
  if (["select", "radio", "multiselect"].includes(type) && !out.source && !out.options?.length) {
    throw new Error(`${path} (“${label}”): add at least one option.`);
  }
  if (Array.isArray(f.only)) out.only = f.only.map(String).slice(0, 50);
  if (f.showWhen && typeof f.showWhen === "object") {
    const s = f.showWhen as Record<string, unknown>;
    if (typeof s.key === "string" && s.key) {
      out.showWhen = { key: s.key };
      if (typeof s.equals === "string") out.showWhen.equals = s.equals;
      if (typeof s.notEquals === "string") out.showWhen.notEquals = s.notEquals;
      if (s.truthy === true) out.showWhen.truthy = true;
    }
  }
  if (type === "repeater") {
    const inner = new Set<string>();
    out.item = (Array.isArray(f.item) ? f.item : []).map((x, i) => cleanField(x, inner, `${path} › item ${i + 1}`));
    if (!out.item.length) throw new Error(`${path} (“${label}”): a repeated block needs at least one field.`);
  }
  return out;
}

/**
 * Checks a form sent from the builder and keeps only what a form can hold.
 * Throws with a sentence the super admin can act on.
 */
export function cleanDefinition(pathway: Pathway, raw: unknown): IntakeDefinition {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(d.steps) || d.steps.length === 0) throw new Error("The form needs at least one step.");
  if (d.steps.length > 40) throw new Error("Too many steps.");
  const seen = new Set<string>();
  const stepKeys = new Set<string>();
  const steps: IntakeStep[] = d.steps.map((rs, i) => {
    const s = (rs ?? {}) as Record<string, unknown>;
    const key = String(s.key ?? "");
    if (!KEY.test(key) || stepKeys.has(key)) throw new Error(`Step ${i + 1} has a missing or repeated key.`);
    stepKeys.add(key);
    const title = (str(s.title, 160) ?? "").trim();
    if (!title) throw new Error(`Step ${i + 1} needs a title.`);
    if (!Array.isArray(s.fields)) throw new Error(`Step “${title}” has no fields.`);
    if (s.fields.length > 200) throw new Error(`Step “${title}” has too many fields.`);
    const step: IntakeStep = {
      key,
      title,
      blurb: str(s.blurb, 600) ?? "",
      fields: s.fields.map((f, j) => cleanField(f, seen, `Step ${i + 1}, field ${j + 1}`)),
    };
    const intro = str(s.intro, 4000);
    if (intro) step.intro = intro;
    if (Array.isArray(s.cards)) {
      step.cards = s.cards
        .map((c) => (c ?? {}) as Record<string, unknown>)
        .filter((c) => typeof c.startsAt === "string" && typeof c.title === "string")
        .map((c) => ({ startsAt: String(c.startsAt), title: String(c.title).slice(0, 160), ...(c.blurb ? { blurb: String(c.blurb).slice(0, 600) } : {}) }));
    }
    return step;
  });

  if (pathway === "study") {
    const missing = LOCKED_KEYS.filter((k) => !seen.has(k));
    if (missing.length) throw new Error("The consent and signature fields must stay on the form.");
  }
  const title = (str(d.title, 120) ?? "").trim() || intakeFor(pathway).title;
  return { pathway, title, steps };
}

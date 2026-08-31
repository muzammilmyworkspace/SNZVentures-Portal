import { COUNTRIES, LANGUAGES } from "./reference.ts";

/**
 * THE SHAPE OF AN INTAKE FORM.
 * ---------------------------------------------------------------------------
 * Forms are data, not components. The server validates against these
 * definitions and the client renders from the same ones, so the form somebody
 * sees and the rules the API enforces cannot drift apart — a field that is not
 * here cannot be rendered, saved, or required.
 *
 * These types grew to carry the student application, which needs four things
 * the original three types could not express: questions that only apply if an
 * earlier answer says so, lists of repeated blocks (each qualification, each
 * language, each job), text that is derived rather than entered, and file
 * slots. Each is a field TYPE rather than a special case in the renderer, so
 * the server can still decide everything from the definition alone.
 *
 * Nothing here asserts a fact. These are questions we ask a client; where one
 * touches on outcomes — visas, funding, employment — the wording promises
 * nothing.
 */

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "number"
  | "select"
  | "multiselect"
  | "textarea"
  /** Single choice, rendered as pills. Same data as a select. */
  | "radio"
  /** One box. Stored as a boolean. */
  | "checkbox"
  /** A list of repeated blocks — qualifications, languages, jobs. */
  | "repeater"
  /** Static prose inside a step. Holds no answer. */
  | "note"
  /** The document slots. Their list depends on an earlier answer. */
  | "documents"
  /** Read-only text assembled from other answers. */
  | "derived"
  /** The whole application, played back before it is sent. */
  | "review";

/**
 * Show this field only when another answer says so.
 *
 * A hidden field is not merely invisible: it is not validated, not required,
 * and not written. Otherwise a question nobody was asked can block a submit.
 */
export type ShowWhen = {
  key: string;
  /** Show when the other answer is exactly this. */
  equals?: string;
  /** Show when it is anything BUT this. */
  notEquals?: string;
  /** Show when the other answer is ticked / non-empty. */
  truthy?: boolean;
};

export type IntakeField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  /**
   * Fill `options` from a shared list at render and validation time. Inlining
   * 240 countries into each of nine selects would be most of this file.
   */
  source?: "countries" | "languages";
  required?: boolean;
  placeholder?: string;
  /** Shown under the field. Use it to explain WHY something is asked. */
  hint?: string;
  /** Characters. Applied on the server as a hard slice, not just a maxlength. */
  max?: number;
  /** Full width in the two-column grid. */
  wide?: boolean;
  showWhen?: ShowWhen;
  /** Typing transforms: a CNIC gains its dashes, a passport goes uppercase. */
  mask?: "cnic" | "upper";
  /** Earliest / latest acceptable date, ISO. */
  dateMin?: string;
  dateMax?: string;
  /** textarea height. */
  rows?: number;
  /** Show a live word count — used on the motivation answers. */
  countWords?: boolean;
  /** Must equal this other field's value. Used for "confirm your email". */
  mustMatch?: string;
  /** repeater only. */
  item?: IntakeField[];
  itemLabel?: string;
  minItems?: number;
  maxItems?: number;
  /** note only. */
  body?: string;
  tone?: "info" | "warn";
  /** documents only: restrict to these slot keys. */
  only?: string[];
  /** Prefilled when the form is empty. The person can always change it. */
  defaultValue?: string;
};

export type IntakeStep = {
  key: string;
  title: string;
  /** One sentence on what this step is for. */
  blurb: string;
  /** The longer introduction at the head of the step, if it needs one. */
  intro?: string;
  fields: IntakeField[];
  /** Grouping headers inside a step, keyed by the field that starts each card. */
  cards?: { startsAt: string; title: string; blurb?: string }[];
};

export type IntakeDefinition = {
  pathway: "study" | "career" | "business";
  title: string;
  steps: IntakeStep[];
};

/** Session role → the intake that role fills in. Derived server-side. */
export const PATHWAY_FOR_ROLE = {
  student: "study",
  professional: "career",
  business: "business",
} as const;

/** The options a field actually offers, with shared lists resolved. */
export function optionsFor(field: IntakeField): string[] {
  if (field.source === "countries") return COUNTRIES as string[];
  if (field.source === "languages") return LANGUAGES as string[];
  return field.options ?? [];
}

/** Fields that hold no answer and are never validated or stored. */
export const DECORATIVE: ReadonlySet<FieldType> = new Set<FieldType>([
  "note",
  "derived",
  "review",
]);

/**
 * Is this field on screen, given the answers so far?
 *
 * Used identically by the renderer and the validator. If the two disagreed,
 * a form could be complete on screen and incomplete on the server, which is
 * the sort of thing people abandon an application over.
 */
export function fieldVisible(
  field: IntakeField,
  answers: Record<string, unknown>
): boolean {
  const cond = field.showWhen;
  if (!cond) return true;
  const other = answers[cond.key];
  if (cond.truthy) return other === true || (typeof other === "string" && other !== "");
  if (cond.equals !== undefined) return other === cond.equals;
  if (cond.notEquals !== undefined) return other !== undefined && other !== "" && other !== cond.notEquals;
  return true;
}

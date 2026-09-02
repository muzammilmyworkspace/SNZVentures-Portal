import { STUDY_APPLICATION } from "../application/definition.ts";
import { DECORATIVE } from "../application/types.ts";
import type { IntakeField } from "../application/types.ts";

/**
 * THE APPLICATION AS A LOOKUP — WHICH ANSWER LIVES WHERE.
 * ---------------------------------------------------------------------------
 * Imported with relative paths rather than the `@/` alias, and holding no
 * database import, so `npm run verify:mcp` can load it in plain Node. That is
 * the whole reason this is not simply part of tools.ts: the repeater
 * flattening and the dotted lookup below are where a real bug would hide, and
 * an untested extractor that silently returns null for every qualification
 * looks exactly like a student who has not filled that section in.
 */

export type FlatField = {
  /** The key the answer is stored under. Repeated items are `parent.child`. */
  key: string;
  label: string;
  section: string;
  type: string;
  /** Set when this answer repeats — a qualification, a job, a language. */
  repeats?: boolean;
};

/**
 * THE APPLICATION, FLATTENED, WITH ITS REAL LABELS.
 *
 * Answers are stored under short keys — `passportNo`, `dob`, `eduSchool` —
 * because that is what the form was built on. Nobody asking for "everyone's
 * passport number" knows the key is `passportNo`, and the model should not
 * have to guess it. This is the lookup that makes the bulk export usable: ask
 * for the fields once, then name them exactly.
 *
 * Decorative fields are dropped. A note, a review screen or a checklist holds
 * no answer, so offering them as extractable would offer columns that are
 * always empty.
 */
export const FLAT_FIELDS: FlatField[] = (() => {
  const out: FlatField[] = [];
  for (const step of STUDY_APPLICATION.steps) {
    for (const field of step.fields) {
      if (DECORATIVE.has(field.type)) continue;

      if (field.type === "repeater" && field.item) {
        // The repeater holds the array; its children hold the answers.
        out.push({
          key: field.key,
          label: field.label,
          section: step.title,
          type: "repeater",
          repeats: true,
        });
        for (const child of field.item as IntakeField[]) {
          if (DECORATIVE.has(child.type)) continue;
          out.push({
            key: `${field.key}.${child.key}`,
            label: `${field.label} — ${child.label}`,
            section: step.title,
            type: child.type,
            repeats: true,
          });
        }
        continue;
      }

      out.push({ key: field.key, label: field.label, section: step.title, type: field.type });
    }
  }
  return out;
})();

export const FIELD_BY_KEY: ReadonlyMap<string, FlatField> = new Map(
  FLAT_FIELDS.map((f) => [f.key, f])
);

/** Renders one stored answer as something readable, whatever shape it is. */
export function readable(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
}

/**
 * Pulls one field out of a stored application.
 *
 * `edu.eduSchool` reaches into every qualification and returns all of them,
 * because "their school" is usually a list and returning only the first would
 * quietly drop the rest — the sort of loss nobody notices until a student is
 * asked why they omitted a degree they did not omit.
 */
export function pick(data: Record<string, unknown>, key: string): unknown {
  if (!key.includes(".")) return readable(data[key]);

  const dot = key.indexOf(".");
  const parent = key.slice(0, dot);
  const child = key.slice(dot + 1);

  const rows = data[parent];
  if (!Array.isArray(rows)) return null;

  const values = rows
    .map((row) =>
      row && typeof row === "object"
        ? readable((row as Record<string, unknown>)[child])
        : null
    )
    .filter((v) => v !== null);

  return values.length ? values : null;
}

/** The whole application, keyed by the label a person would recognise. */
export function labelled(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const field of FLAT_FIELDS) {
    // The repeater row itself is covered by its children; printing both would
    // list every qualification twice.
    if (field.type === "repeater") continue;
    const value = pick(data, field.key);
    if (value !== null && value !== undefined) out[field.label] = value;
  }

  // Anything the form no longer asks but the record still holds. Dropping it
  // silently would mean an answer that exists and cannot be found — a stored
  // answer with no way to read it is worse than no answer at all.
  for (const [key, value] of Object.entries(data)) {
    if (FIELD_BY_KEY.has(key)) continue;
    const v = readable(value);
    if (v !== null) out[`(unlisted: ${key})`] = v;
  }

  return out;
}

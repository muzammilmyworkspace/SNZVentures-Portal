import type { IntakeField } from "@/lib/portal/intake";

/** Renders one saved answer, handling multi-selects and empty values. */
/**
 * One answer, as a line of text a person can read.
 *
 * Repeated blocks and document slots are objects. Passing them through
 * String() prints "[object Object]", and an array of them prints it once per
 * row — so the client file showed a wall of that where a student's education
 * history should be. They are summarised instead: everything the row actually
 * holds, in the order it was asked for.
 */
export function answerOf(field: IntakeField, data: Record<string, unknown>) {
  const v = data[field.key];
  if (v === undefined || v === null) return null;

  if (field.type === "checkbox") return v === true ? "Yes" : null;

  if (field.type === "repeater") {
    const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    const lines = rows
      .map((row) =>
        (field.item ?? [])
          .map((sub) => String(row?.[sub.key] ?? "").trim())
          .filter(Boolean)
          .join(" · ")
      )
      .filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  }

  if (field.type === "documents") {
    const held = (v ?? {}) as Record<string, unknown>;
    const lines = Object.entries(held)
      .filter(([, name]) => typeof name === "string" && name.trim())
      .map(([slot, name]) => `${slot}: ${String(name)}`);
    return lines.length ? lines.join("\n") : null;
  }

  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (String(v).trim() === "") return null;
  return String(v);
}

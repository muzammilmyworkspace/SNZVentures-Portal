"use client";

import type { IntakeDefinition, IntakeField } from "@/lib/application/types";
import { fieldVisible, DECORATIVE } from "@/lib/application/types";
import { documentsFor } from "@/lib/application/documents";
import { cn } from "@/lib/utils";

/**
 * THE APPLICATION, PLAYED BACK BEFORE IT IS SENT.
 * ---------------------------------------------------------------------------
 * Nine sections filled in over several sittings, read back in one place, the
 * way the person who decides on it will read it. Mistakes that are invisible
 * inside a single step — a passport number typed into the CNIC box, a
 * graduation date before a start date — are obvious here.
 *
 * MISSING ANSWERS ARE SHOWN, NOT HIDDEN. A blank marked in red beside its
 * question is actionable; a summary that quietly omits it is how somebody
 * submits an incomplete file believing it complete. Each section carries a
 * button back to itself.
 */

function displayValue(field: IntakeField, data: Record<string, unknown>): string | null {
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
    const names = Object.entries(held)
      .filter(([, name]) => typeof name === "string" && name.trim())
      .map(([slot, name]) => `${slot}: ${String(name)}`);
    return names.length ? names.join("\n") : null;
  }

  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return String(v).trim() || null;
}

export function ReviewSummary({
  definition,
  answers,
  onEdit,
}: {
  definition: IntakeDefinition;
  answers: Record<string, unknown>;
  onEdit: (stepIndex: number) => void;
}) {
  const requiredDocs = documentsFor(String(answers.applyLevel ?? "")).filter((d) => d.required);
  const heldDocs = (answers.documents ?? {}) as Record<string, unknown>;
  const missingDocs = requiredDocs.filter((d) => !heldDocs[d.key]);

  return (
    <div className="space-y-4">
      {definition.steps.map((step, index) => {
        // The review section itself has nothing to play back.
        const rows = step.fields.filter(
          (f) => !DECORATIVE.has(f.type) && fieldVisible(f, answers)
        );
        if (!rows.length) return null;

        return (
          <section key={step.key} className="overflow-hidden rounded-[var(--radius-md)] border border-line">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-raised px-4 py-3">
              <h3 className="label text-faint">
                {String(index + 1).padStart(2, "0")} · {step.title}
              </h3>
              <button
                type="button"
                onClick={() => onEdit(index)}
                className="label min-h-11 rounded-[var(--radius-sm)] border border-line px-3 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
              >
                Edit
              </button>
            </header>

            <dl className="px-4 py-1">
              {rows.map((field) => {
                const value = displayValue(field, answers);
                const blank = value === null;
                return (
                  <div
                    key={field.key}
                    className="grid gap-1 border-b border-line/60 py-3 last:border-0 sm:grid-cols-[minmax(9rem,34%)_1fr] sm:gap-5"
                  >
                    <dt className="text-[0.8rem] leading-relaxed text-muted">{field.label}</dt>
                    <dd
                      className={cn(
                        "m-0 whitespace-pre-wrap break-words text-[0.86rem] leading-relaxed",
                        blank
                          ? field.required
                            ? "italic text-red-300"
                            : "italic text-faint"
                          : "font-semibold text-fg"
                      )}
                    >
                      {blank ? (field.required ? "Not answered" : "Not provided") : value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}

      {missingDocs.length > 0 && (
        <p className="rounded-[var(--radius-sm)] border border-red-400/40 bg-red-500/10 p-4 text-[0.86rem] leading-relaxed text-red-200">
          <strong className="font-semibold">
            {missingDocs.length} required document{missingDocs.length === 1 ? "" : "s"} still to
            attach:
          </strong>{" "}
          {missingDocs.map((d) => d.title).join(", ")}.
        </p>
      )}
    </div>
  );
}

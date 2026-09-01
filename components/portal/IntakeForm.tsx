"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  IntakeDefinition,
  IntakeField,
  IntakeStep,
} from "@/lib/portal/intake";
import { optionsFor, fieldVisible, DECORATIVE } from "@/lib/application/types";
import { buildMotivation } from "@/lib/application/motivation";
import { filenamePrefix } from "@/lib/application/documents";
import { DIAL_CODES } from "@/lib/application/reference";
import { dateProblem, resolveBound } from "@/lib/application/dates";
import { ReviewSummary } from "@/components/application/ReviewSummary";
import { UndertakingDoc } from "@/components/application/UndertakingDoc";
import { ChecklistBoard } from "@/components/application/ChecklistBoard";
import {
  applyMask,
  RadioPills,
  CheckField,
  NoteBlock,
  WordCount,
  Repeater,
  DocumentSlots,
  DerivedBlock,
} from "@/components/application/Fields";
import { cn } from "@/lib/utils";

/**
 * THE MULTI-STEP INTAKE FORM
 * ---------------------------------------------------------------------------
 * Rendered entirely from the definition in lib/portal/intake.ts, which is the
 * same file the API validates against. A field cannot exist here without
 * existing there, so the form and its rules cannot drift.
 *
 * BEHAVIOUR THIS FORM IS BUILT AROUND
 *
 *  • One step on screen at a time. Nine steps of questions shown at once is
 *    the thing that makes people abandon an application.
 *  • Nothing is ever lost. Every step change saves a draft, and the resume
 *    point comes back from the server, so closing the tab mid-form is safe.
 *  • Client-side validation only ever GUIDES. The server re-checks everything;
 *    this exists so someone learns about a missing field before a round trip,
 *    not as the boundary.
 *  • The final step lists what is still missing, with a link straight to the
 *    step that holds it. "Some fields are invalid" with no location is the
 *    most common way a long form becomes unfinishable.
 */

type Answers = Record<string, unknown>;
type Status = "draft" | "submitted" | "under_review" | "accepted" | "returned";

/* ----------------------------------------------------------------- fields */

function FieldControl({
  field,
  value,
  onChange,
  invalid,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid: boolean;
}) {
  const id = `f-${field.key}`;
  const described = field.hint ? `${id}-hint` : undefined;
  const common = {
    id,
    "aria-invalid": invalid || undefined,
    "aria-describedby": described,
    className: "field",
  };

  if (field.type === "textarea") {
    return (
      <textarea
        {...common}
        rows={field.rows ?? 4}
        maxLength={field.max}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={cn("field resize-y", (field.rows ?? 4) > 2 ? "min-h-28" : "min-h-16")}
      />
    );
  }

  if (field.type === "radio") {
    return <RadioPills field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "checkbox") {
    return <CheckField field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "select") {
    return (
      <select
        {...common}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {optionsFor(field).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      /*
        Checkboxes rather than a <select multiple>. Multi-select boxes are
        close to unusable on a phone — they need a modifier key most touch
        keyboards do not have — and this form is filled in on phones.
      */
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={described}
        className="flex flex-wrap gap-2"
      >
        {optionsFor(field).map((o) => {
          const on = selected.includes(o);
          return (
            <label
              key={o}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3.5 text-[0.85rem] transition-colors",
                on
                  ? "border-moss-400/70 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent"
                  : "border-line text-muted hover:border-moss-400/40 hover:text-fg"
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() =>
                  onChange(on ? selected.filter((s) => s !== o) : [...selected, o])
                }
              />
              <span
                aria-hidden
                className={cn(
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                  on ? "border-moss-400 bg-moss-400" : "border-line"
                )}
              >
                {on && (
                  <svg viewBox="0 0 10 10" className="h-2 w-2 text-navy-950">
                    <path
                      d="M1 5l2.5 2.5L9 2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              {o}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <input
      {...common}
      type={field.type}
      maxLength={field.max}
      /*
        min/max stop a date control accepting an impossible year. Typing into
        the year box is not capped on its own, so without these a five-digit
        year arrives as a perfectly well-formed value.
      */
      min={field.dateMin}
      max={field.dateMax}
      value={String(value ?? "")}
      onChange={(e) => onChange(field.mask ? applyMask(field.mask, e.target.value) : e.target.value)}
      placeholder={field.placeholder}
      className={cn("field", field.mask && "font-mono tracking-wide")}
    />
  );
}

function Field({
  field,
  value,
  onChange,
  invalid,
  problem,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid: boolean;
  problem?: string | null;
}) {
  const id = `f-${field.key}`;

  // A note carries no answer, and a checkbox carries its own label inside the
  // box — giving either the standard label would print the words twice.
  if (field.type === "note") return <NoteBlock field={field} />;
  if (field.type === "checkbox") {
    return <FieldControl field={field} value={value} onChange={onChange} invalid={invalid} />;
  }

  const labelless = field.type === "radio" || field.type === "multiselect";

  return (
    <div>
      <label
        id={`${id}-label`}
        htmlFor={labelless ? undefined : id}
        className="field-label"
      >
        {field.label}
        {field.required && (
          <>
            {" "}
            {/*
              RED, and theme-aware.

              It was the brand green, which is the same colour this interface
              uses for "done", "approved" and "on track" — so the one mark
              meaning "you must fill this in" was drawn in the palette's
              reassuring colour and did not read as a requirement at all.

              `text-danger` alone is too pale on the light theme to carry
              meaning, so the darker red is the base and the pale one is the
              override, the same pairing ErrorNote uses in AuthForms.
            */}
            <span
              aria-hidden
              className="font-semibold text-[#D92D20] dark:text-danger [html[data-theme=dark]_&]:text-danger"
            >
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </label>
      <FieldControl field={field} value={value} onChange={onChange} invalid={invalid} />
      {field.countWords && (
        <p className="mt-1.5">
          <WordCount text={String(value ?? "")} />
        </p>
      )}
      {field.hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
          {field.hint}
        </p>
      )}
      {invalid && (
        <p role="alert" className="mt-1.5 text-[0.8rem] text-danger">
          {problem ?? "This one is required."}
        </p>
      )}
    </div>
  );
}

/**
 * Split a step's visible fields into the cards the definition asks for.
 *
 * Anything before the first named card sits in an unnamed group, so a step
 * that declares no cards renders exactly as it did before.
 */
function groupIntoCards(step: IntakeStep, answers: Answers) {
  const visible = step.fields.filter((f) => fieldVisible(f, answers));
  const starts = new Map((step.cards ?? []).map((c) => [c.startsAt, c]));

  const cards: { title?: string; blurb?: string; fields: IntakeField[] }[] = [
    { fields: [] },
  ];
  for (const field of visible) {
    const opens = starts.get(field.key);
    if (opens) cards.push({ title: opens.title, blurb: opens.blurb, fields: [] });
    cards[cards.length - 1].fields.push(field);
  }
  return cards.filter((c) => c.fields.length > 0);
}

/* ------------------------------------------------------------- the wizard */

const isBlank = (f: IntakeField, v: unknown) => {
  if (f.type === "checkbox") return v !== true;
  if (f.type === "repeater") {
    const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    if (rows.length < (f.minItems ?? 1)) return true;
    return !rows.every((row) =>
      (f.item ?? [])
        .filter((sub) => sub.required)
        .every((sub) => String(row?.[sub.key] ?? "").trim() !== "")
    );
  }
  if (f.type === "documents") return false; // decided across steps, not here

  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === null || String(v).trim() === "";
};

/*
  A question hidden behind a condition the person did not meet is not an
  unanswered question. Counting it would leave somebody stuck on a step,
  told something is missing, with nothing on screen to fill in.
*/
export type Problem = { field: IntakeField; message: string };

/*
  "This one is required" was the only thing this could ever say, which made it
  actively misleading beside a date box the browser had refused to parse — the
  answer looked present and the form insisted it was absent. Each problem now
  carries its own sentence.
*/
function missingIn(step: IntakeStep, answers: Answers): Problem[] {
  const out: Problem[] = [];

  for (const f of step.fields) {
    if (DECORATIVE.has(f.type)) continue;
    if (!fieldVisible(f, answers)) continue;

    if (f.type === "date") {
      const bad = dateProblem(
        String(answers[f.key] ?? ""),
        { min: resolveBound(f.dateMin), max: resolveBound(f.dateMax) },
        f.label
      );
      if (bad) {
        out.push({ field: f, message: bad });
        continue;
      }
    }

    if (f.required && isBlank(f, answers[f.key])) {
      out.push({
        field: f,
        message:
          f.type === "checkbox"
            ? "Please tick this to continue."
            : f.type === "repeater"
              ? "Please complete this section."
              : "This one is required.",
      });
    }
  }

  return out;
}

export function IntakeForm({
  definition,
  initialAnswers,
  initialStep,
  checklistTicks = {},
  status,
}: {
  definition: IntakeDefinition;
  initialAnswers: Answers;
  initialStep: number;
  /**
   * The document checklist's ticks, which live in their own table rather than
   * in the form — they have to keep working after this locks. See migration 011.
   */
  checklistTicks?: Record<string, boolean>;
  status: Status;
}) {
  const router = useRouter();
  const steps = definition.steps;

  /*
    Prefilled answers are merged in ONCE, here, and only where the person has
    not already answered. Doing it in an effect would fight with their typing;
    doing it on the server would write a default into the database that nobody
    chose.
  */
  const [answers, setAnswers] = useState<Answers>(() => {
    const seeded: Answers = { ...initialAnswers };
    for (const s of definition.steps) {
      for (const f of s.fields) {
        if (f.defaultValue !== undefined && seeded[f.key] === undefined) {
          seeded[f.key] = f.defaultValue;
        }
      }
    }
    return seeded;
  });
  // Resume where they stopped, clamped in case the form gained or lost a step
  // since the draft was written.
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialStep, 0), steps.length - 1)
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(status !== "draft");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = steps[index];
  const gaps = useMemo(() => (touched ? missingIn(step, answers) : []), [touched, step, answers]);

  const set = useCallback((key: string, v: unknown) => {
    setAnswers((a) => {
      const next = { ...a, [key]: v };
      /*
        Choosing a citizenship fills in the dialling code.

        It is still an ordinary field they can edit afterwards — plenty of
        people hold one passport and a phone from somewhere else — but the
        common case is that the two match, and typing "+92" is one more thing
        to get wrong on a form that already has ninety questions.
      */
      if (key === "citizenship") {
        const dial = DIAL_CODES[String(v)];
        if (dial) next.dial = dial;
      }
      return next;
    });
    setSavedAt(null);
  }, []);

  /**
   * Move focus to the step heading on every change of step.
   * Without this a keyboard or screen-reader user presses "Next" and focus
   * stays on a button that now belongs to a different step — the new questions
   * are simply never announced.
   */
  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  const save = useCallback(
    async (stepIndex: number, resumeAt = stepIndex, silent = false) => {
      if (submitted) return true;
      if (!silent) setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/portal/intake", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // `step` says which questions these answers are; `resumeAt` says
          // where to reopen. They are only the same for a draft save.
          body: JSON.stringify({ step: stepIndex, resumeAt, answers }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(data.error ?? "We couldn't save your progress.");
          return false;
        }
        setSavedAt(new Date().toISOString());
        return true;
      } catch {
        setError("Network problem — your answers are still on screen. Try again.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [answers, submitted]
  );

  /**
   * Back to the top of the form.
   *
   * Saving a draft left the page exactly where it was — usually halfway down a
   * long section, with the confirmation up in the header where nobody was
   * looking. The button appeared to do nothing at all, so people pressed it
   * again. Changing step already moves focus to the heading; a save that stays
   * on the same step has to move the page itself.
   */
  const toTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  async function next() {
    setTouched(true);
    if (missingIn(step, answers).length) return;
    // Answers belong to `index`; the resume point moves on because it is done.
    const ok = await save(index, index + 1);
    if (!ok) return;
    setTouched(false);
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    toTop();
  }

  function back() {
    setTouched(false);
    setIndex((i) => Math.max(i - 1, 0));
    toTop();
  }

  /** Everything still missing, anywhere in the form, with its step. */
  const outstanding = useMemo(
    () =>
      steps.flatMap((s, i) =>
        missingIn(s, answers).map((p) => ({
          step: i,
          stepTitle: s.title,
          // The field name for a blank, the reason for anything else — a list
          // that just repeats "Expiry date" three times does not help anyone
          // find the one that is actually wrong.
          label: p.message === "This one is required." ? p.field.label : `${p.field.label} — ${p.message}`,
        }))
      ),
    [steps, answers]
  );

  async function submit() {
    setTouched(true);
    if (outstanding.length) {
      setError("Some required answers are still missing — they're listed below.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't submit this form.");
        setSaving(false);
        return;
      }
      setSubmitted(true);
      router.refresh();
    } catch {
      setError("Network problem. Your answers are saved — try submitting again.");
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-moss-400/30 bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-6 sm:p-8">
        <p className="label text-accent">Received</p>
        <h2 className="mt-3 text-[1.35rem] font-bold tracking-[-0.02em] text-fg-strong">
          Your {definition.title.toLowerCase()} is with us.
        </h2>
        <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-muted">
          An advisor reads it and comes back to you with the next step. You can
          keep uploading documents in the meantime — that is usually what moves
          things fastest.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/portal/documents"
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
          >
            Upload documents
          </Link>
          <Link
            href="/portal/journey"
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
          >
            Track progress
          </Link>
        </div>
      </div>
    );
  }

  const percent = Math.round(((index + 1) / steps.length) * 100);
  const onLast = index === steps.length - 1;

  return (
    <div>
      {/* Progress */}
      <div className="mb-7">
        <div className="flex items-baseline justify-between gap-4">
          <p className="label text-faint">
            Step {index + 1} of {steps.length}
          </p>
          <p className="text-[0.8rem] text-faint" aria-live="polite">
            {saving ? "Saving…" : savedAt ? "Progress saved" : " "}
          </p>
        </div>
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Form progress"
        >
          <div
            className="h-full rounded-full bg-moss-400 transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Step rail — jumping back is allowed, jumping ahead is not, because
            a later step may depend on an answer that has not been given. */}
        <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                disabled={i > index}
                onClick={() => {
                  setTouched(false);
                  setIndex(i);
                }}
                className={cn(
                  // -my-2/py-2 keeps the rail visually tight while giving each
                  // step a real hit box; these are jump targets, not labels.
                  "-my-2 inline-flex min-h-11 items-center py-2 text-[0.8rem] transition-colors",
                  i === index && "font-semibold text-accent",
                  i < index && "text-muted hover:text-fg",
                  i > index && "cursor-default text-faint opacity-50"
                )}
              >
                {i + 1}. {s.title}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* Step */}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-[1.35rem] font-bold tracking-[-0.02em] text-fg-strong outline-none sm:text-[1.5rem]"
      >
        {step.title}
      </h2>
      <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-muted">{step.blurb}</p>
      {step.intro && (
        <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-muted">{step.intro}</p>
      )}

      {/*
        Grouped into cards, because a step of thirty questions in one run is
        the thing that makes a form feel endless. The grouping is declared in
        the definition — a card starts at a named field — so the shape of the
        form stays in one file rather than being half here and half there.
      */}
      <div className="mt-7 space-y-5">
        {groupIntoCards(step, answers).map((card, ci) => (
          <section
            key={card.title ?? ci}
            className={cn(
              card.title &&
                "rounded-[var(--radius-lg)] border border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] p-5 sm:p-6"
            )}
          >
            {card.title && <h3 className="label mb-1 text-faint">{card.title}</h3>}
            {card.blurb && (
              <p className="mb-4 max-w-2xl text-[0.85rem] leading-relaxed text-muted">
                {card.blurb}
              </p>
            )}

            <div className={cn("grid gap-5 sm:grid-cols-2", card.title && !card.blurb && "mt-4")}>
              {card.fields.map((f) => (
                <div
                  key={f.key}
                  className={cn(
                    "min-w-0",
                    (f.wide ||
                      f.type === "textarea" ||
                      f.type === "multiselect" ||
                      f.type === "repeater" ||
                      f.type === "documents" ||
                      f.type === "derived" ||
                      f.type === "note") &&
                      "sm:col-span-2"
                  )}
                >
                  {f.type === "repeater" ? (
                    <>
                      <label className="field-label">{f.label}</label>
                      <Repeater
                        field={f}
                        rows={Array.isArray(answers[f.key]) ? (answers[f.key] as Record<string, unknown>[]) : []}
                        onChange={(rows) => set(f.key, rows)}
                        renderItem={(sub, value, setValue) => (
                          <Field field={sub} value={value} onChange={setValue} invalid={false} />
                        )}
                      />
                    </>
                  ) : f.type === "documents" ? (
                    <DocumentSlots
                      field={f}
                      applyLevel={String(answers.applyLevel ?? "")}
                      prefix={filenamePrefix(
                        String(answers.familyName ?? ""),
                        String(answers.givenName ?? "")
                      )}
                      value={(answers[f.key] as Record<string, string>) ?? {}}
                      onChange={(next) => set(f.key, next)}
                    />
                  ) : f.type === "checklist" ? (
                    <ChecklistBoard
                      applyLevel={String(answers.applyLevel ?? "")}
                      intake={String(answers.intake ?? "")}
                      dependants={String(answers.dependants ?? "")}
                      initialTicks={checklistTicks}
                    />
                  ) : f.type === "consent" ? (
                    <UndertakingDoc />
                  ) : f.type === "review" ? (
                    <ReviewSummary definition={definition} answers={answers} onEdit={setIndex} />
                  ) : f.type === "derived" ? (
                    <DerivedBlock text={buildMotivation(answers)} />
                  ) : (
                    <Field
                      field={f}
                      value={answers[f.key]}
                      onChange={(v) => set(f.key, v)}
                      invalid={gaps.some((g) => g.field.key === f.key)}
                      problem={gaps.find((g) => g.field.key === f.key)?.message}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-[var(--radius-sm)] border border-red-400/40 bg-red-500/10 px-4 py-3 text-[0.85rem] text-danger"
        >
          {error}
        </p>
      )}

      {/* On the last step, name what is missing and where it lives. */}
      {onLast && touched && outstanding.length > 0 && (
        <div className="mt-6 rounded-[var(--radius-sm)] border border-line p-4">
          <p className="label text-faint">Still needed</p>
          <ul className="mt-3 space-y-1.5">
            {outstanding.map((o) => (
              <li key={`${o.step}-${o.label}`} className="text-[0.85rem] text-muted">
                <button
                  type="button"
                  onClick={() => {
                    setTouched(false);
                    setIndex(o.step);
                  }}
                  className="text-left underline underline-offset-4 transition-colors hover:text-accent"
                >
                  {o.label}
                </button>
                <span className="text-faint"> — step {o.step + 1}, {o.stepTitle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Controls */}
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {index > 0 && (
          <button
            type="button"
            onClick={back}
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
          >
            Back
          </button>
        )}

        {onLast ? (
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-6 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit application"}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={saving}
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-6 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        )}

        <button
          type="button"
          onClick={async () => {
            await save(index);
            toTop();
          }}
          disabled={saving}
          className="label min-h-11 px-2 text-muted transition-colors hover:text-fg disabled:opacity-60"
        >
          Save as draft
        </button>
      </div>

      <p className="mt-4 text-[0.75rem] text-faint">
        Your answers are saved as you go. You can close this and come back to it.
      </p>
    </div>
  );
}

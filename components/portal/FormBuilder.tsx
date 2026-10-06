"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { IntakeDefinition, IntakeField, IntakeStep, FieldType } from "@/lib/application/types";
import { LOCKED_KEYS } from "@/lib/portal/form-rules";
import { cn } from "@/lib/utils";

/**
 * THE APPLICATION FORM BUILDER. Super admin only.
 *
 * Steps down the side, the chosen step's questions in the middle. Add, edit,
 * move and delete questions and steps; nothing reaches students until Save.
 * Answers students already gave are never deleted: a removed question is just
 * no longer asked.
 *
 * The consent and signature stay on the form (the submit records them), so
 * they can be relabelled but not removed.
 */

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Short answer",
  textarea: "Long answer",
  email: "Email",
  tel: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  radio: "Choice pills",
  multiselect: "Multiple choice",
  checkbox: "Tick box",
  note: "Information text",
  repeater: "Repeated block",
  documents: "Document uploads",
  derived: "Auto-written text",
  review: "Review of answers",
  consent: "Consent document",
  checklist: "Checklist",
};

/** Types a question can be created as, or switched between. */
const SIMPLE: FieldType[] = ["text", "textarea", "email", "tel", "number", "date", "select", "radio", "multiselect", "checkbox", "note"];
const CHOICES: FieldType[] = ["select", "radio", "multiselect"];

const PRIMARY =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-moss-400 px-5 text-[0.9rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";
const GHOST =
  "inline-flex min-h-9 items-center gap-2 rounded-full border border-line px-4 text-[0.82rem] font-medium text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-50";

const rid = () => Math.random().toString(36).slice(2, 8);

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/* ------------------------------------------------------------- icons */

const Icon = {
  up: <path d="M8 12V4M4.5 7.5L8 4l3.5 3.5" />,
  down: <path d="M8 4v8M4.5 8.5L8 12l3.5-3.5" />,
  edit: <path d="M10.5 2.5l3 3L6 13H3v-3z" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />,
  copy: <path d="M5.5 5.5h7v7h-7zM3.5 10.5v-7h7" />,
  lock: <path d="M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 014 0v2" />,
};

function IconBtn({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: keyof typeof Icon;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tip={label}
      className={cn("tip icon-btn disabled:opacity-30", danger && "hover:!border-red-400/60 hover:!text-danger")}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {Icon[icon]}
      </svg>
    </button>
  );
}

/* ------------------------------------------------------- field editor */

function FieldEditor({ field, onChange }: { field: IntakeField; onChange: (f: IntakeField) => void }) {
  const set = (patch: Partial<IntakeField>) => onChange({ ...field, ...patch });
  const simple = SIMPLE.includes(field.type);
  const [optionsText, setOptionsText] = useState((field.options ?? []).join("\n"));

  return (
    <div className="mt-3 grid gap-4 rounded-[var(--radius-md)] border border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] p-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="field-label">{field.type === "note" ? "Heading (optional)" : "Question"}</span>
        <input value={field.label} onChange={(e) => set({ label: e.target.value })} maxLength={300} className="field" />
      </label>

      <label className="block">
        <span className="field-label">Type</span>
        {simple ? (
          <select
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as FieldType;
              const patch: Partial<IntakeField> = { type };
              if (CHOICES.includes(type) && !field.options?.length && !field.source) {
                patch.options = ["Option 1", "Option 2"];
                setOptionsText("Option 1\nOption 2");
              }
              set(patch);
            }}
            className="field"
          >
            {SIMPLE.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        ) : (
          <input value={TYPE_LABEL[field.type]} readOnly className="field opacity-70" />
        )}
      </label>

      {field.type !== "note" && field.type !== "consent" && field.type !== "review" && field.type !== "derived" && (
        <label className="flex items-center gap-2.5 self-end pb-2.5 text-[0.9rem] text-fg">
          <input type="checkbox" checked={field.required === true} onChange={(e) => set({ required: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--accent)]" />
          Required
        </label>
      )}

      {CHOICES.includes(field.type) &&
        (field.source ? (
          <p className="text-[0.82rem] text-muted sm:col-span-2">
            Options come from the full list of {field.source}.{" "}
            <button type="button" className="text-accent underline underline-offset-4" onClick={() => set({ source: undefined, options: field.options?.length ? field.options : ["Option 1"] })}>
              Use my own options instead
            </button>
          </p>
        ) : (
          <label className="block sm:col-span-2">
            <span className="field-label">Options — one per line</span>
            <textarea
              value={optionsText}
              rows={Math.min(10, Math.max(3, optionsText.split("\n").length + 1))}
              onChange={(e) => {
                setOptionsText(e.target.value);
                set({ options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) });
              }}
              className="field min-h-0 py-2.5"
            />
          </label>
        ))}

      {field.type === "note" ? (
        <label className="block sm:col-span-2">
          <span className="field-label">Text</span>
          <textarea value={field.body ?? ""} rows={4} onChange={(e) => set({ body: e.target.value })} className="field min-h-0 py-2.5" />
        </label>
      ) : (
        <>
          <label className="block sm:col-span-2">
            <span className="field-label">Help text under the question (optional)</span>
            <input value={field.hint ?? ""} onChange={(e) => set({ hint: e.target.value || undefined })} maxLength={600} className="field" />
          </label>
          {["text", "textarea", "email", "tel", "number"].includes(field.type) && (
            <label className="block">
              <span className="field-label">Placeholder (optional)</span>
              <input value={field.placeholder ?? ""} onChange={(e) => set({ placeholder: e.target.value || undefined })} maxLength={600} className="field" />
            </label>
          )}
          {["text", "textarea"].includes(field.type) && (
            <label className="block">
              <span className="field-label">Max characters (optional)</span>
              <input
                type="number"
                min={1}
                value={field.max ?? ""}
                onChange={(e) => set({ max: e.target.value ? Number(e.target.value) : undefined })}
                className="field"
              />
            </label>
          )}
        </>
      )}

      <label className="flex items-center gap-2.5 text-[0.9rem] text-fg sm:col-span-2">
        <input type="checkbox" checked={field.wide === true} onChange={(e) => set({ wide: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--accent)]" />
        Full width
      </label>

      {field.showWhen && (
        <p className="text-[0.78rem] text-faint sm:col-span-2">
          Only shown when “{field.showWhen.key}” is{" "}
          {field.showWhen.equals ?? (field.showWhen.notEquals ? `not ${field.showWhen.notEquals}` : "answered")}.{" "}
          <button type="button" className="text-accent underline underline-offset-4" onClick={() => set({ showWhen: undefined })}>
            Always show
          </button>
        </p>
      )}

      {field.type === "repeater" && (
        <div className="sm:col-span-2">
          <span className="field-label">Questions in each block</span>
          <FieldList fields={field.item ?? []} onChange={(item) => set({ item })} nested />
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- field list */

function FieldList({
  fields,
  onChange,
  nested = false,
}: {
  fields: IntakeField[];
  onChange: (fields: IntakeField[]) => void;
  nested?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function add(type: FieldType) {
    const key = `q_${rid()}`;
    const f: IntakeField = {
      key,
      label: type === "note" ? "" : "New question",
      type,
      ...(CHOICES.includes(type) ? { options: ["Option 1", "Option 2"] } : {}),
      ...(type === "note" ? { body: "Write the information here.", tone: "info" as const } : {}),
    };
    onChange([...fields, f]);
    setOpen(key);
    setAdding(false);
  }

  return (
    <div>
      <ol className={cn("space-y-2", nested && "mt-1")}>
        {fields.map((f, i) => {
          const locked = LOCKED_KEYS.includes(f.key);
          return (
            <li key={f.key} className="rounded-[var(--radius-md)] border border-line bg-[var(--panel-solid)] px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="num w-6 shrink-0 text-center font-mono text-[0.72rem] text-faint">{i + 1}</span>
                <button type="button" onClick={() => setOpen(open === f.key ? null : f.key)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[0.9rem] text-fg">
                    {f.label || (f.type === "note" ? (f.body ?? "").slice(0, 80) || "Information" : TYPE_LABEL[f.type])}
                    {f.required && <span className="ml-1 text-danger">*</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-faint">
                    <span className="rounded-full border border-line px-1.5 py-px">{TYPE_LABEL[f.type]}</span>
                    {f.showWhen && <span>conditional</span>}
                    {f.type === "repeater" && <span>{f.item?.length ?? 0} questions</span>}
                    {locked && <span>needed for signing</span>}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn label="Move up" icon="up" onClick={() => onChange(move(fields, i, i - 1))} disabled={i === 0} />
                  <IconBtn label="Move down" icon="down" onClick={() => onChange(move(fields, i, i + 1))} disabled={i === fields.length - 1} />
                  <IconBtn label={open === f.key ? "Close" : "Edit"} icon="edit" onClick={() => setOpen(open === f.key ? null : f.key)} />
                  {!locked && SIMPLE.includes(f.type) && (
                    <IconBtn
                      label="Duplicate"
                      icon="copy"
                      onClick={() => {
                        const next = [...fields];
                        next.splice(i + 1, 0, { ...f, key: `q_${rid()}`, label: f.label ? `${f.label} (copy)` : f.label });
                        onChange(next);
                      }}
                    />
                  )}
                  {locked ? (
                    <span data-tip="Needed for signing — cannot be deleted" className="tip icon-btn opacity-60">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        {Icon.lock}
                      </svg>
                    </span>
                  ) : (
                    <IconBtn
                      label="Delete"
                      icon="trash"
                      danger
                      onClick={() => {
                        if (window.confirm(`Delete “${f.label || TYPE_LABEL[f.type]}”? Answers already given are kept in student files.`)) {
                          onChange(fields.filter((_, j) => j !== i));
                        }
                      }}
                    />
                  )}
                </div>
              </div>
              {open === f.key && <FieldEditor field={f} onChange={(nf) => onChange(fields.map((x, j) => (j === i ? nf : x)))} />}
            </li>
          );
        })}
      </ol>

      <div className="mt-3">
        {adding ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] p-3">
            <p className="mb-2 text-[0.8rem] text-faint">What kind of question?</p>
            <div className="flex flex-wrap gap-2">
              {SIMPLE.map((t) => (
                <button key={t} type="button" onClick={() => add(t)} className={GHOST}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
              <button type="button" onClick={() => setAdding(false)} className="px-3 text-[0.82rem] text-faint hover:text-fg">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={GHOST}>
            + Add {nested ? "a question to the block" : "question"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ builder */

export function FormBuilder({
  pathway,
  initial,
  edited,
}: {
  pathway: IntakeDefinition["pathway"];
  initial: IntakeDefinition;
  /** Who saved the form in force, when it is not the original. */
  edited: { by: string | null; at: string } | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<IntakeDefinition>(initial);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const baseline = useMemo(() => JSON.stringify(initial), [initial]);
  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const step = form.steps[Math.min(index, form.steps.length - 1)];
  const setSteps = (steps: IntakeStep[]) => setForm({ ...form, steps });
  const setStep = (patch: Partial<IntakeStep>) =>
    setSteps(form.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const hasLocked = (s: IntakeStep) => s.fields.some((f) => LOCKED_KEYS.includes(f.key));

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/admin/forms/application", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathway, definition: form }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setSaved("Saved. Students see this form from now on.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("Go back to the original form? Your changes to the form are removed; student answers are kept.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forms/application?pathway=${pathway}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setIndex(0);
      setSaved("Back to the original form.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Save bar */}
      <div className="sticky top-[76px] z-20 mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-line bg-[var(--panel-solid)] px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1 text-[0.82rem]">
          {dirty ? (
            <span className="font-medium text-warn">Unsaved changes</span>
          ) : edited ? (
            <span className="text-faint">
              Edited form in use · saved {new Date(edited.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {edited.by ? ` by ${edited.by}` : ""}
            </span>
          ) : (
            <span className="text-faint">Original form in use</span>
          )}
          {error && (
            <span role="alert" className="ml-3 text-danger">
              {error}
            </span>
          )}
          {saved && !dirty && <span className="ml-3 text-ok">{saved}</span>}
        </div>
        {dirty && (
          <button type="button" onClick={() => { setForm(initial); setError(null); }} disabled={busy} className={GHOST}>
            Discard
          </button>
        )}
        {edited && !dirty && (
          <button type="button" onClick={reset} disabled={busy} className={GHOST}>
            Reset to original
          </button>
        )}
        <button type="button" onClick={save} disabled={busy || !dirty} className={PRIMARY}>
          {busy ? "Saving…" : "Save form"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Steps */}
        <nav aria-label="Steps" className="space-y-1.5">
          <label className="mb-3 block">
            <span className="field-label">Form title</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} className="field" />
          </label>
          {form.steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                i === index ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-line hover:border-[var(--line-strong)]"
              )}
            >
              <span className="num font-mono text-[0.72rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.88rem] font-medium text-fg">{s.title || "Untitled step"}</span>
                <span className="text-[0.72rem] text-faint">{s.fields.length} items</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setSteps([...form.steps, { key: `step_${rid()}`, title: "New step", blurb: "", fields: [] }]);
              setIndex(form.steps.length);
            }}
            className={cn(GHOST, "mt-2 w-full justify-center")}
          >
            + Add step
          </button>
        </nav>

        {/* The chosen step */}
        {step && (
          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="block min-w-[14rem] flex-1">
                <span className="field-label">Step title</span>
                <input value={step.title} onChange={(e) => setStep({ title: e.target.value })} maxLength={160} className="field" />
              </label>
              <div className="flex items-center gap-1 pb-1">
                <IconBtn label="Move step up" icon="up" onClick={() => { setSteps(move(form.steps, index, index - 1)); setIndex(index - 1); }} disabled={index === 0} />
                <IconBtn label="Move step down" icon="down" onClick={() => { setSteps(move(form.steps, index, index + 1)); setIndex(index + 1); }} disabled={index === form.steps.length - 1} />
                {!hasLocked(step) && form.steps.length > 1 && (
                  <IconBtn
                    label="Delete step"
                    icon="trash"
                    danger
                    onClick={() => {
                      if (window.confirm(`Delete the step “${step.title}” and its ${step.fields.length} items?`)) {
                        setSteps(form.steps.filter((_, i) => i !== index));
                        setIndex(Math.max(0, index - 1));
                      }
                    }}
                  />
                )}
              </div>
            </div>
            <label className="mb-5 block">
              <span className="field-label">One line on what this step is for</span>
              <input value={step.blurb} onChange={(e) => setStep({ blurb: e.target.value })} maxLength={600} className="field" />
            </label>
            <FieldList fields={step.fields} onChange={(fields) => setStep({ fields })} />
          </section>
        )}
      </div>
    </div>
  );
}

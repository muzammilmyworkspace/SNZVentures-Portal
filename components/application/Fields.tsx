"use client";

import { useRef, useState } from "react";
import type { IntakeField } from "@/lib/application/types";
import { optionsFor } from "@/lib/application/types";
import { documentsFor, documentFilename, type DocumentSlot } from "@/lib/application/documents";
import { wordCount } from "@/lib/application/motivation";
import { cn } from "@/lib/utils";

/**
 * THE FIELD KINDS THE STUDENT APPLICATION NEEDS AND THE OTHER FORMS DO NOT.
 * ---------------------------------------------------------------------------
 * Pills for a single choice, one-box declarations, repeated blocks, static
 * notes, derived text, and document slots that name the file for you.
 *
 * They live apart from IntakeForm so that file stays the wizard — steps,
 * saving, validation — rather than a switch statement with eleven arms.
 */

/* ------------------------------------------------------------------ masks */

/**
 * Typing transforms, applied as somebody types rather than checked afterwards.
 *
 * A pasted CNIC arrives in half a dozen shapes and a passport number is often
 * copied in lower case. Correcting that quietly is kinder than an error
 * message telling an applicant they typed their own ID card wrong.
 */
export function applyMask(mask: IntakeField["mask"], raw: string): string {
  if (mask === "cnic") {
    const digits = raw.replace(/\D/g, "").slice(0, 13);
    let out = digits.slice(0, 5);
    if (digits.length > 5) out += `-${digits.slice(5, 12)}`;
    if (digits.length > 12) out += `-${digits.slice(12, 13)}`;
    return out;
  }
  if (mask === "upper") return raw.toUpperCase();
  return raw;
}

/* ------------------------------------------------------------------ pills */

export function RadioPills({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: string) => void;
}) {
  const current = String(value ?? "");
  return (
    <div role="radiogroup" aria-labelledby={`f-${field.key}-label`} className="flex flex-wrap gap-2">
      {optionsFor(field).map((option) => {
        const on = current === option;
        return (
          <label
            key={option}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[0.85rem] transition-colors",
              on
                ? "border-moss-400/70 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] font-semibold text-accent"
                : "border-line text-muted hover:border-moss-400/40 hover:text-fg"
            )}
          >
            <input
              type="radio"
              name={`f-${field.key}`}
              className="sr-only"
              checked={on}
              onChange={() => onChange(option)}
            />
            {option}
          </label>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- one box */

export function CheckField({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: unknown;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-line p-4 transition-colors hover:border-line-strong">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-moss-400"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-[0.88rem] leading-relaxed text-fg">{field.label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ notes */

export function NoteBlock({ field }: { field: IntakeField }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border p-4 text-[0.86rem] leading-relaxed",
        field.tone === "info"
          ? "border-moss-400/40 bg-moss-400/10 text-fg"
          : "border-line bg-raised text-muted"
      )}
    >
      {field.label && <strong className="font-semibold text-fg">{field.label}. </strong>}
      {field.body}
    </div>
  );
}

/* ------------------------------------------------------------ word counts */

export function WordCount({ text }: { text: string }) {
  const n = wordCount(text);
  return (
    <span
      className={cn(
        "font-mono text-[0.7rem] tracking-wide",
        n >= 40 ? "text-moss-300" : n > 0 ? "text-amber-300" : "text-faint"
      )}
    >
      {n} {n === 1 ? "word" : "words"}
      {n < 25 && " · aim for 40+"}
    </span>
  );
}

/* -------------------------------------------------------------- repeaters */

export function Repeater({
  field,
  rows,
  onChange,
  renderItem,
}: {
  field: IntakeField;
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  renderItem: (
    sub: IntakeField,
    value: unknown,
    set: (v: unknown) => void,
    index: number
  ) => React.ReactNode;
}) {
  const min = field.minItems ?? 0;
  const max = field.maxItems ?? 20;
  const list = rows.length ? rows : min > 0 ? [{}] : [];

  const setRow = (index: number, key: string, value: unknown) => {
    const next = list.map((row, i) => (i === index ? { ...row, [key]: value } : row));
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {list.map((row, index) => (
        <div key={index} className="rounded-[var(--radius-md)] border border-line bg-raised p-5">
          <header className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3">
            <span className="label text-faint">
              {field.itemLabel ?? "Entry"} {index + 1}
            </span>
            {list.length > min && (
              <button
                type="button"
                onClick={() => onChange(list.filter((_, i) => i !== index))}
                className="label min-h-11 px-2 text-faint transition-colors hover:text-red-300"
              >
                Remove
              </button>
            )}
          </header>
          <div className="grid gap-5 sm:grid-cols-2">
            {(field.item ?? []).map((sub) => (
              <div key={sub.key} className={cn("min-w-0", sub.wide && "sm:col-span-2")}>
                {renderItem(sub, row[sub.key], (v) => setRow(index, sub.key, v), index)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {list.length < max && (
        <button
          type="button"
          onClick={() => onChange([...list, {}])}
          className="w-full rounded-[var(--radius-md)] border border-dashed border-line-strong px-6 py-4 text-[0.88rem] font-semibold text-fg transition-colors hover:border-moss-400/70 hover:text-accent"
        >
          + Add {field.itemLabel ? field.itemLabel.toLowerCase() : "another"}
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------- document slots */

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* Clipboard refused — the name is on screen and can be typed. */
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="label shrink-0 rounded-full bg-moss-400 px-2.5 py-1 text-[0.6rem] text-navy-950 transition-colors hover:bg-moss-300"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Slot({
  slot,
  prefix,
  attached,
  onAttach,
}: {
  slot: DocumentSlot;
  prefix: string;
  attached: string | undefined;
  onAttach: (file: File) => Promise<string | null>;
  }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filename = documentFilename(prefix, slot);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is over 5 MB. Please compress it.");
      return;
    }
    setBusy(true);
    const problem = await onAttach(file);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border p-4 transition-colors sm:p-5",
        attached ? "border-moss-400/50 bg-moss-400/[0.07]" : "border-line hover:border-line-strong"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem] font-semibold text-fg">{slot.title}</p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{slot.description}</p>
        </div>
        <span
          className={cn(
            "label shrink-0 rounded-full border px-2.5 py-1 text-[0.6rem]",
            slot.required ? "border-red-400/50 text-red-300" : "border-line text-faint"
          )}
        >
          {slot.required ? "Required" : "If you have it"}
        </span>
      </div>

      {/*
        The exact filename, with a copy button. Universities match files to
        applicants by name; "scan_final(2).pdf" is a file that gets asked for
        again. Showing the answer beats describing the rule.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-navy-950 px-3 py-2">
        <code className="min-w-0 break-all font-mono text-[0.72rem] text-[#cfe0f5]">{filename}</code>
        <CopyButton text={filename} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="label inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
        >
          {busy ? "Uploading…" : attached ? "Replace" : "Attach"}
        </button>
        {attached && (
          <span className="min-w-0 break-all text-[0.8rem] text-moss-300">
            Attached: <span className="font-semibold">{attached}</span>
          </span>
        )}
      </div>

      <input
        ref={input}
        type="file"
        className="sr-only"
        accept={slot.extension === "jpg" ? "image/jpeg" : "application/pdf"}
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function DocumentSlots({
  field,
  applyLevel,
  prefix,
  value,
  onChange,
}: {
  field: IntakeField;
  applyLevel: string;
  prefix: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const all = documentsFor(applyLevel);
  const slots = field.only ? all.filter((s) => field.only!.includes(s.key)) : all;

  async function upload(slot: DocumentSlot, file: File): Promise<string | null> {
    const body = new FormData();
    body.append("file", file);
    body.append("category", "Application");
    body.append("name", documentFilename(prefix, slot));
    try {
      const res = await fetch("/api/portal/documents", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return data.error ?? "That didn't upload. Please try again.";
      onChange({ ...value, [slot.key]: file.name });
      return null;
    } catch {
      return "Network problem. Please check your connection and try again.";
    }
  }

  return (
    <div className="space-y-3">
      {!applyLevel && !field.only && (
        <div className="rounded-[var(--radius-sm)] border border-moss-400/40 bg-moss-400/10 p-4 text-[0.86rem] leading-relaxed text-fg">
          <strong className="font-semibold">Choose your study level in section 01</strong> and
          this list will adjust — Bachelor&rsquo;s and Master&rsquo;s applicants need different
          documents.
        </div>
      )}
      {slots.map((slot) => (
        <Slot
          key={slot.key}
          slot={slot}
          prefix={prefix}
          attached={value[slot.key]}
          onAttach={(file) => upload(slot, file)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------- the built letter */

export function DerivedBlock({ text }: { text: string }) {
  const words = wordCount(text);
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-navy-950 p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="label text-moss-300">Letter of motivation — draft</h4>
        {text && (
          <span className="font-mono text-[0.7rem] text-[#7ba0df]">
            {words} words
            {words < 250
              ? " · most universities want 400–600"
              : words > 700
                ? " · consider trimming"
                : " · good length"}
          </span>
        )}
      </header>
      <div className="max-h-[22rem] overflow-y-auto whitespace-pre-wrap pr-2 text-[0.92rem] leading-[1.85] text-[#e7edf8]">
        {text || "Answer the five questions above and your draft will appear here."}
      </div>
    </div>
  );
}

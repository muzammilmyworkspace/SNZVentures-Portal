"use client";

import { useState } from "react";

/**
 * A password input with a reveal toggle.
 *
 * Shared rather than copied because Settings renders two of these in adjacent
 * panels — Security and Email address — and a field that reveals in one panel
 * but not the next reads as a bug in the panel that lacks it. Whatever is true
 * of one has to be true of both, which is what sharing the component enforces.
 */

export function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-[18px] w-[18px]">
      <path
        d="M1.7 10S4.6 4.8 10 4.8 18.3 10 18.3 10 15.4 15.2 10 15.2 1.7 10 1.7 10z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      {/* The stroke through it is what says "hidden" — an eye alone is ambiguous
          about whether it shows the current state or the action. */}
      {!open && (
        <path d="M3.5 3.5l13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  autoComplete,
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  autoComplete: string;
  required?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="field pr-12"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          /*
            The label names the ACTION and never changes, while aria-pressed
            carries the state. A label that flips between "Show" and "Hide" is
            announced at the moment it changes, so a screen reader reads out the
            opposite of what just happened.
          */
          aria-label="Show password"
          aria-pressed={reveal}
          aria-controls={id}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors hover:text-fg"
        >
          <EyeIcon open={reveal} />
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

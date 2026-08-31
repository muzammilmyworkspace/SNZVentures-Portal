"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * CHANGE PASSWORD — the same control for every role.
 *
 * The current password is required even though the person is signed in, and
 * the field order says why: you prove who you are, then you choose. The server
 * enforces all of it again; nothing here is the boundary.
 */

function EyeIcon({ open }: { open: boolean }) {
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
      {!open && <path d="M3.5 3.5l13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  autoComplete: string;
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
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="field pr-12"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label="Show password"
          aria-pressed={reveal}
          aria-controls={id}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors hover:text-fg"
        >
          <EyeIcon open={reveal} />
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.75rem] text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/portal/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't change your password.");
        return;
      }
      // Clear the fields — leaving a password sitting in a form after it has
      // been used is a small thing that costs nothing to avoid.
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <PasswordField
        id="current-password"
        label="Current password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasswordField
        id="new-password"
        label="New password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        hint="At least 4 characters."
      />
      <PasswordField
        id="confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-red-500/45 bg-red-500/10 px-4 py-3 text-[0.9rem] font-medium text-[#B42318] [html[data-theme=dark]_&]:text-red-200"
        >
          {error}
        </p>
      )}
      {done && (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-moss-400/45 bg-moss-400/10 px-4 py-3 text-[0.9rem] font-medium text-accent-ink"
        >
          Password changed. Use it the next time you sign in.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !current || !next || !confirm}
        className={cn(
          "label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {busy ? "Changing…" : "Change password"}
      </button>

      <p className="text-[0.75rem] leading-relaxed text-faint">
        Signing in on other devices will still work until those sessions expire.
      </p>
    </form>
  );
}

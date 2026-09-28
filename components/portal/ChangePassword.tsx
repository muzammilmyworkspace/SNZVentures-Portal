"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { PasswordField } from "@/components/portal/PasswordField";

/**
 * CHANGE PASSWORD — the same control for every role.
 *
 * The current password is required even though the person is signed in, and
 * the field order says why: you prove who you are, then you choose. The server
 * enforces all of it again; nothing here is the boundary.
 */

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
          className="rounded-[var(--radius-sm)] border border-red-500/45 bg-red-500/10 px-4 py-3 text-[0.9rem] font-medium text-danger"
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

"use client";

import { useState, type FormEvent } from "react";

/**
 * Move the address this account signs in with.
 *
 * The password field is not friction for its own sake: without it, anybody who
 * reaches an unlocked laptop owns the account for good — change the address,
 * then request a reset to it. The wording says why, because a form that asks
 * for a password with no explanation reads as a nuisance and gets resented.
 */
export function ChangeEmail({ current }: { current: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portal/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sentTo?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through.");
        return;
      }
      setSentTo(data.sentTo ?? email);
      setEmail("");
      setPassword("");
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-3">
        <p className="note-ok p-4 text-[0.88rem] leading-relaxed">
          Check <strong className="font-semibold">{sentTo}</strong> and open the link to confirm.
          It works once and expires in an hour.
        </p>
        <p className="text-[0.82rem] leading-relaxed text-faint">
          Until then you keep signing in with {current}. We have also let that address know, in
          case the request was not yours.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[0.86rem] leading-relaxed text-muted">
        You sign in with <strong className="font-semibold text-fg">{current}</strong>. It changes
        only once the new address is confirmed, so a typo cannot lock you out.
      </p>

      <div>
        <label htmlFor="new-email" className="field-label">
          New email address
        </label>
        <input
          id="new-email"
          type="email"
          required
          autoComplete="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="info@snzventures.com"
        />
      </div>

      <div>
        <label htmlFor="current-password" className="field-label">
          Your current password
        </label>
        <input
          id="current-password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
          Asked because this moves where password resets are sent. A signed-in session on its own
          must not be enough to do that.
        </p>
      </div>

      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send confirmation"}
      </button>
    </form>
  );
}

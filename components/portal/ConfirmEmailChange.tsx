"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The last step, behind a button.
 *
 * NOT ON PAGE LOAD. Mail scanners, link previewers and corporate security
 * appliances follow every URL in a message the moment it arrives — a change
 * applied on GET would be applied by a robot before the person ever opened
 * their mail, and the single-use token would already be spent by the time
 * they clicked. The same reasoning is written up in app/verify-email.
 */
export function ConfirmEmailChange({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        email?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That link could not be used.");
        return;
      }
      setDone(data.email ?? null);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line p-6 sm:p-8">
        <h1 className="text-[1.4rem] font-bold tracking-[-0.02em] text-fg-strong">
          This link is incomplete
        </h1>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
          Open the link from your email exactly as it was sent — some mail apps cut long links in
          half.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line p-6 sm:p-8">
        <p className="label text-ok">Confirmed</p>
        <h1 className="mt-3 text-[1.4rem] font-bold tracking-[-0.02em] text-fg-strong">
          You now sign in with {done}
        </h1>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
          Your old address will no longer work, and we have let it know. Everything else about your
          account is unchanged.
        </p>
        <Link
          href="/portal"
          className="label mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
        >
          Go to the portal
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-line p-6 sm:p-8">
      <p className="label text-faint">SnZ Ventures</p>
      <h1 className="mt-3 text-[1.4rem] font-bold tracking-[-0.02em] text-fg-strong">
        Confirm your new email address
      </h1>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-muted">
        Press confirm and this becomes the address you sign in with. Your old one stops working
        straight away.
      </p>

      {error && (
        <p role="alert" className="note-danger mt-5 p-4 text-[0.86rem] leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="label mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Confirming…" : "Confirm this address"}
      </button>

      <p className="mt-5 text-[0.8rem] leading-relaxed text-faint">
        If you did not ask for this, close this page and change your password — somebody else may
        know it.
      </p>
    </div>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Create a consultant account.
 *
 * No password is chosen here and none is shown — the server generates one
 * nobody ever sees and issues a single-use link instead, which the new
 * consultant spends to choose their own. See app/api/admin/staff.
 *
 * The link comes back whether or not the invitation email went out, and the
 * panel says which happened. An admin who is told "sent" when nothing was sent
 * waits for a consultant who is never coming.
 */
export function AddConsultant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    link: string;
    emailed: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        name?: string;
        email?: string;
        link?: string;
        emailed?: boolean;
      };
      if (!res.ok || !data.ok || !data.link) {
        setError(data.error ?? "We couldn't create that account.");
        return;
      }
      setCreated({
        name: data.name ?? name,
        email: data.email ?? email,
        link: data.link,
        emailed: Boolean(data.emailed),
      });
      setName("");
      setEmail("");
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The link is on screen and selectable; a failure here needs no message. */
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <p className={created.emailed ? "note-ok p-4" : "note-warn p-4"}>
          <span className="text-[0.88rem] leading-relaxed">
            <strong className="font-semibold">{created.name}</strong> can now sign in with{" "}
            <strong className="font-semibold">{created.email}</strong>.{" "}
            {created.emailed
              ? "We have emailed them a link to choose their password."
              : "Email is not configured on this deployment, so nothing was sent — send them this link yourself."}
          </span>
        </p>

        {!created.emailed && (
          <div className="rail break-all p-4 font-mono text-[0.8rem] leading-relaxed text-fg">
            {created.link}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {!created.emailed && (
            <button
              type="button"
              onClick={copy}
              className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setOpen(false);
            }}
            className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
          >
            Done
          </button>
        </div>

        <p className="text-[0.78rem] leading-relaxed text-faint">
          The link works once and expires in three days. If it lapses, use Reset password on
          their row in Users to issue another.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
      >
        Add consultant
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="consultant-name" className="field-label">
          Full name
        </label>
        <input
          id="consultant-name"
          type="text"
          required
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ayesha Rahman"
        />
      </div>

      <div>
        <label htmlFor="consultant-email" className="field-label">
          Their email
        </label>
        <input
          id="consultant-email"
          type="email"
          required
          autoComplete="off"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ayesha@example.com"
          aria-describedby="consultant-email-hint"
        />
        <p id="consultant-email-hint" className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
          This is the address they sign in with, and where the invitation goes. No password is
          set here — they choose their own from the link.
        </p>
      </div>

      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !name || !email}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

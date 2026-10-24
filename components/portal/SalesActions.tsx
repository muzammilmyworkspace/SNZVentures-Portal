"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/** A sales agent adds a student: name + email, and a sign-up link is emailed to them. */
export function SalesInvite() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ link: string; emailed: boolean; to: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portal/sales/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; link?: string; emailed?: boolean };
      if (!res.ok || !data.ok || !data.link) {
        setError(data.error ?? "We couldn't send that. Please try again.");
        return;
      }
      setDone({ link: data.link, emailed: !!data.emailed, to: email });
      setName("");
      setEmail("");
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p className="note-ok p-4 text-[0.88rem] leading-relaxed">
          {done.emailed ? (
            <>
              Sign-up link emailed to <strong className="font-semibold">{done.to}</strong>.
            </>
          ) : (
            <>The link is ready. Send it to the student yourself (WhatsApp works).</>
          )}
        </p>
        <div className="flex gap-2">
          <input readOnly value={done.link} className="field font-mono text-[0.8rem]" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(done.link).then(() => setCopied(true))}
            className="label shrink-0 rounded-full border border-line px-4 text-fg hover:border-accent"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button type="button" onClick={() => (setDone(null), setCopied(false))} className="label text-muted underline underline-offset-4 hover:text-fg">
          Add another student
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[0.82rem] font-medium text-muted">Student&apos;s full name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[0.82rem] font-medium text-muted">Student&apos;s email</span>
        <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {error && (
        <p role="alert" className="text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="font-[family-name:var(--font-display)] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send sign-up link"}
      </button>
    </form>
  );
}

/** "Push to Super Admin" for one student whose initial fee is verified. */
export function HandOverButton({ studentId, name }: { studentId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function push() {
    if (!confirm(`Hand ${name}'s case over to the Super Admin?\n\nYou will still see their progress, but AdmitsFair takes the case from here.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/portal/sales/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) alert(data.error ?? "That didn't work. Please try again.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={push}
      disabled={busy}
      className="font-[family-name:var(--font-display)] inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-moss-400 px-4 text-[0.85rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
    >
      {busy ? "Sending…" : "Push to Super Admin"}
    </button>
  );
}

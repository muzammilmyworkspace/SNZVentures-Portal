"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Mint one enrolment link and show it once.
 *
 * NOT EMAILED. The consultant already has a WhatsApp thread with this student;
 * asking them to send it themselves is both faster and honest about where the
 * conversation actually happens. It also means enrolment does not wait on a
 * mail transport — the same reasoning as the admin password-reset link.
 *
 * SHOWN ONCE, because only the hash is stored. The copy button is therefore
 * the real control on this screen, not a convenience: a link that is closed
 * before it is copied is gone, and the honest answer is to say so on the panel
 * rather than to keep the token around so it can be re-read later.
 */
export function InviteStudent({ forConsultantId }: { forConsultantId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || null, note: note || null, forConsultantId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        link?: string;
        emailed?: boolean;
        sentTo?: string | null;
      };
      if (!res.ok || !data.ok || !data.link) {
        setError(data.error ?? "We couldn't create that link. Please try again.");
        return;
      }
      setLink(data.link);
      setSentTo(data.emailed ? (data.sentTo ?? null) : null);
      setEmail("");
      setNote("");
      // The list of pending links below this panel is server-rendered.
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /*
        Clipboard access is refused in some browsers and over plain HTTP. The
        link is already on screen and selectable, so there is nothing to
        recover from — saying "copy failed" would only be noise.
      */
    }
  }

  if (link) {
    return (
      <div className="space-y-4">
        {/*
          The link is shown even when it was emailed. A consultant who wants to
          send it over WhatsApp as well should not have to withdraw it and make
          another to get the URL, and "we emailed it" is not a reason to hide
          the thing that was emailed.
        */}
        <p className="note-ok p-4 text-[0.88rem] leading-relaxed">
          {sentTo ? (
            <>
              Emailed to <strong className="font-semibold">{sentTo}</strong>. The same link is
              below if you would rather send it yourself as well.
            </>
          ) : (
            <>
              Send this link to <strong className="font-semibold">one</strong> student. It works
              once, and stops working after 14 days.
            </>
          )}
        </p>

        <div className="rail break-all p-4 font-mono text-[0.8rem] leading-relaxed text-fg">
          {link}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setLink(null);
              setSentTo(null);
              setOpen(false);
            }}
            className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
          >
            Done
          </button>
        </div>

        <p className="text-[0.78rem] leading-relaxed text-faint">
          Copy it now — it cannot be shown again. If you lose it, withdraw it below and create
          another.
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
        Add new student
      </button>
    );
  }

  return (
    <form onSubmit={create} className="space-y-4">
      <div>
        <label htmlFor="invite-email" className="field-label">
          Their email <span className="text-faint">(optional)</span>
        </label>
        <input
          id="invite-email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@example.com"
          aria-describedby="invite-email-hint"
        />
        <p id="invite-email-hint" className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
          Fill this in and we email the link straight to them. Leave it blank and you get the
          link to send yourself. Either way they can sign up with a different address.
        </p>
      </div>

      <div>
        <label htmlFor="invite-note" className="field-label">
          Note <span className="text-faint">(optional)</span>
        </label>
        <input
          id="invite-note"
          type="text"
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Ayesha — Germany, autumn intake"
        />
      </div>

      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create link"}
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

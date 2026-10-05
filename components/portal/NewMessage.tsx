"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { memberId, groupOf } from "@/lib/portal/member-id";

type Person = { id: string; name: string; email: string; role: string; memberNo: number | null; avatarV: number | null };

/** A small window over the page, inside the portal shell (see AddStaffButton). */
function Window({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
      <div className="relative w-full max-w-lg rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-[1.15rem] font-semibold text-fg-strong">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-btn">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.querySelector(".portal-shell") ?? document.body
  );
}

const plusIcon = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="h-4 w-4">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

/**
 * NEW MESSAGE — admins. Find anyone on the portal by name or email, write,
 * send; it lands in their own chat and the sender is taken into the thread.
 */
export function NewMessageButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [to, setTo] = useState<Person | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || to || q.trim().length < 2) {
      setPeople([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/people?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const data = (await res.json()) as { people?: Person[] };
        setPeople(data.people ?? []);
      } catch {}
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, to]);

  function close() {
    setOpen(false);
    setQ("");
    setTo(null);
    setText("");
    setError(null);
  }

  async function send() {
    if (!to) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: to.id, body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; conversationId?: string };
      if (!res.ok || !data.ok || !data.conversationId) throw new Error(data.error ?? "That didn't send.");
      router.push(`/portal/messages/${data.conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't send.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90"
      >
        {plusIcon}
        New message
      </button>
      {open && (
        <Window title="New message" onClose={close}>
          <label htmlFor="nm-to" className="field-label">To</label>
          {to ? (
            <div className="mt-1.5 flex items-center justify-between gap-3 rounded-[12px] border border-line p-3">
              <span className="flex items-center gap-3">
                <Avatar id={to.id} name={to.name} photo={to.avatarV != null} v={to.avatarV} size="md" />
                <span>
                  <span className="block text-[0.92rem] font-semibold text-fg">{to.name}</span>
                  <span className="block text-[0.78rem] text-faint">{to.email}</span>
                </span>
              </span>
              <button type="button" onClick={() => setTo(null)} className="text-[0.8rem] text-muted underline underline-offset-4 hover:text-fg">
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="nm-to"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a student, consultant or employee by name or email"
                className="field mt-1.5"
              />
              {people.length > 0 && (
                <ul className="mt-2 max-h-64 overflow-y-auto rounded-[12px] border border-line">
                  {people.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setTo(p)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
                      >
                        <Avatar id={p.id} name={p.name} photo={p.avatarV != null} v={p.avatarV} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.9rem] text-fg">{p.name}</span>
                          <span className="block truncate text-[0.75rem] text-faint">{p.email}</span>
                        </span>
                        <span data-group={groupOf(p.role)} className="group-id font-mono text-[0.72rem] font-semibold">
                          {memberId(p.role, p.memberNo)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q.trim().length >= 2 && people.length === 0 && <p className="mt-2 text-[0.82rem] text-faint">Nobody matches yet.</p>}
            </>
          )}
          <label htmlFor="nm-text" className="field-label mt-4 block">Message</label>
          <textarea id="nm-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} className="field mt-1.5 resize-y" />
          {error && <p role="alert" className="mt-2 text-[0.85rem] text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.9rem] text-muted hover:text-fg">
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={busy || !to || !text.trim()}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[0.9rem] font-semibold text-[#070B1A] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </Window>
      )}
    </>
  );
}

/** A consultant writes to the firm: opens their own thread with SnZ Ventures. */
export function MessageFirmButton({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: `Consultant: ${name}`, message: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; conversationId?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't send.");
      router.push(data.conversationId ? `/portal/messages/${data.conversationId}` : "/portal/messages");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't send.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90"
      >
        {plusIcon}
        Message SnZ Ventures
      </button>
      {open && (
        <Window title="Message SnZ Ventures" onClose={() => setOpen(false)}>
          <label htmlFor="mf-text" className="field-label">Message</label>
          <textarea id="mf-text" autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} className="field mt-1.5 resize-y" />
          {error && <p role="alert" className="mt-2 text-[0.85rem] text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.9rem] text-muted hover:text-fg">
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={busy || !text.trim()}
              className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[0.9rem] font-semibold text-[#070B1A] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </Window>
      )}
    </>
  );
}

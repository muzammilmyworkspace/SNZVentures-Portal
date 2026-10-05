"use client";

import { useState } from "react";

/**
 * SEND ONE MESSAGE TO MANY PEOPLE, from any people list.
 *
 * Two ways to choose who: tick people on the page, or send to everyone in the
 * current view (all pages of the filter, not just the rows on screen). Each
 * person receives it in their own chat, so a reply is private to them.
 */
export function MessageBar({
  picked,
  total,
  filter,
  viewLabel,
  onSent,
}: {
  picked: string[];
  total: number;
  filter?: { role?: string; status?: string; q?: string };
  viewLabel: string;
  onSent?: () => void;
}) {
  const [mode, setMode] = useState<null | "picked" | "all">(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const count = mode === "all" ? total : picked.length;

  async function send() {
    if (text.trim().length < 2) {
      setResult({ ok: false, text: "Write the message first." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "all" ? { filter: filter ?? {}, body: text } : { userIds: picked, body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; sent?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't send.");
      setResult({ ok: true, text: `Sent to ${data.sent} ${data.sent === 1 ? "person" : "people"}. It is in each one's Messages.` });
      setText("");
      setMode(null);
      onSent?.();
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "That didn't send." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden className="h-4 w-4 text-accent">
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
        <span className="text-[0.85rem] text-muted">
          {picked.length ? `${picked.length} selected` : "Tick people to message them, or message everyone here."}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!picked.length}
            onClick={() => {
              setMode("picked");
              setResult(null);
            }}
            className="inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] font-semibold text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-40"
          >
            Message selected{picked.length ? ` (${picked.length})` : ""}
          </button>
          <button
            type="button"
            disabled={!total}
            onClick={() => {
              setMode("all");
              setResult(null);
            }}
            className="inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] font-semibold text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-40"
          >
            Message everyone in {viewLabel} ({total})
          </button>
        </span>
      </div>

      {mode && (
        <div className="mt-3 rounded-[12px] border border-line bg-[var(--panel-solid)] p-3">
          <label htmlFor="broadcast-text" className="label text-[0.68rem] text-faint">
            {mode === "all" ? `To everyone in ${viewLabel} · ${count} people` : `To ${count} selected ${count === 1 ? "person" : "people"}`}
          </label>
          <textarea
            id="broadcast-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="e.g. Our office is closed on Friday. Messages will be answered on Monday."
            className="field mt-1 w-full resize-y text-[0.9rem]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.75rem] text-faint">Each person gets it in their own chat, with a notification.</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-[0.82rem] font-semibold text-[#070B1A] disabled:opacity-50"
              >
                {busy ? "Sending…" : `Send to ${count}`}
              </button>
            </span>
          </div>
        </div>
      )}
      {result && (
        <p role="status" className={`mt-2 text-[0.82rem] ${result.ok ? "text-accent" : "text-danger"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}

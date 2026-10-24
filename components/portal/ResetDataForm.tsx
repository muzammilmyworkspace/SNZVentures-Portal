"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ResetDataForm({ total }: { total: number }) {
  const router = useRouter();
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (word !== "DELETE") return;
    if (!confirm(`Delete ${total} account(s) and everything they own? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/reset-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: word }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; accounts?: number; files?: number };
      if (!res.ok || !data.ok) setMsg({ ok: false, text: data.error ?? "The reset failed." });
      else {
        setMsg({ ok: true, text: `Done: ${data.accounts ?? 0} account(s) and ${data.files ?? 0} file(s) deleted.` });
        setWord("");
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Network problem. Check the counts and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-[0.85rem] text-muted">
          Type <strong className="font-mono text-fg-strong">DELETE</strong> to confirm
        </span>
        <input className="field font-mono" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <button
        type="submit"
        disabled={busy || word !== "DELETE" || total === 0}
        className="font-[family-name:var(--font-display)] inline-flex min-h-11 items-center rounded-full bg-red-600 px-6 text-[0.95rem] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
      >
        {busy ? "Deleting…" : total === 0 ? "Nothing to delete" : `Delete ${total} account(s)`}
      </button>
      {msg && (
        <p role="status" className={`text-[0.88rem] ${msg.ok ? "text-ok" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

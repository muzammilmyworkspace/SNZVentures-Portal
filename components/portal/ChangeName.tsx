"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** The name on this account: shown in the sidebar, on messages and on new invoices. */
export function ChangeName({ current }: { current: string }) {
  const router = useRouter();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; name?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through.");
        return;
      }
      setName(data.name ?? name);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="account-name" className="field-label">
          Name
        </label>
        <input
          id="account-name"
          className="field"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          maxLength={80}
          autoComplete="name"
          required
        />
      </div>
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}
      {saved && <p className="note-ok p-3 text-[0.85rem]">Saved. Your new name shows everywhere in the portal.</p>}
      <button
        type="submit"
        disabled={busy || name.trim() === current}
        className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}

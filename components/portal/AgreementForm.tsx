"use client";

import { useState, type FormEvent } from "react";
import { ConsentDoc } from "@/components/application/UndertakingDoc";
import type { ConsentView } from "@/lib/portal/forms";

/**
 * A consultant signs SnZ Ventures' consultant agreement: read it, tick, type
 * their name. Posts to /api/auth/agreement, then into the portal.
 */
export function AgreementForm({ agreement, name }: { agreement: ConsentView; name: string }) {
  const [agree, setAgree] = useState(false);
  const [signed, setSigned] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agreement.id, agree, signedName: signed }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through. Please try again.");
        return;
      }
      window.location.assign(data.redirectTo ?? "/portal");
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ConsentDoc consent={agreement} />
      <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-line p-3.5 text-[0.9rem] text-fg">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        I have read and agree to the {agreement.title} above.
      </label>
      <div>
        <label htmlFor="ag-name" className="field-label">
          Type your full name to sign
        </label>
        <input id="ag-name" value={signed} onChange={(e) => setSigned(e.target.value)} placeholder={name} className="field" maxLength={160} />
      </div>
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem]">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !agree || signed.trim().length < 2}
        className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] inline-flex min-h-12 w-full items-center justify-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Signing…" : "Sign and continue"}
      </button>
    </form>
  );
}

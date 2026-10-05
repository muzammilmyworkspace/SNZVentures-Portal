"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Settings: link yourself to the consultant who gave you a code. */
export function ConsultantCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/consultant-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; consultantName?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't work.");
      setMsg({ ok: true, text: `Done. ${data.consultantName} is now your consultant.` });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="ccode" className="field-label">
        Consultant code
      </label>
      <div className="mt-1.5 flex flex-wrap gap-3">
        <input
          id="ccode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="SNZ-ABC123"
          maxLength={12}
          className="field min-w-0 flex-1 font-mono uppercase"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 10}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[0.9rem] font-semibold text-[#070B1A] disabled:opacity-50"
        >
          {busy ? "Checking…" : "Add"}
        </button>
      </div>
      <p className={msg ? (msg.ok ? "mt-2 text-[0.82rem] text-accent" : "mt-2 text-[0.82rem] text-danger") : "mt-2 text-[0.78rem] text-faint"} role={msg ? "status" : undefined}>
        {msg?.text ?? "If an SnZ consultant gave you a code, enter it so they can follow your application."}
      </p>
    </form>
  );
}

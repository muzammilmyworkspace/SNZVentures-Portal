"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Who this student belongs to, and the control to change it. Moved here from
 * the Users list, which now shows IDs instead. Goes through the same
 * /api/admin/users actions, so the rules and the audit entry are unchanged.
 */
export function AssignConsultant({
  userId,
  currentId,
  advisors,
}: {
  userId: string;
  currentId: string | null;
  advisors: { id: string; name: string; code: string | null }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentId ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = value !== (currentId ?? "");

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const body = value
        ? { userId, action: "assign_advisor", advisorId: value }
        : { userId, action: "unassign_advisor", advisorId: currentId };
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Consultant"
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value);
            setMsg(null);
          }}
          className="chip-select min-w-[14rem]"
        >
          <option value="">Direct (no consultant)</option>
          {advisors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.code ? ` · ${a.code}` : ""}
            </option>
          ))}
        </select>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex min-h-9 items-center rounded-full bg-[var(--accent)] px-4 text-[0.85rem] font-semibold text-[#070B1A] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {msg && <p className={`mt-2 text-[0.8rem] ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}

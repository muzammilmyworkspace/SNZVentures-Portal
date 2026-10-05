"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AREAS } from "@/lib/portal/permissions";

/**
 * What an employee may use, in their details window. A super admin can tick
 * areas on and off, or give full access; everyone else only reads it. The
 * change applies on the employee's next click (it is read per request).
 */
export function EmployeeAccess({
  userId,
  permissions,
  canEdit,
}: {
  userId: string;
  permissions: string[] | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [full, setFull] = useState(permissions == null);
  const [areas, setAreas] = useState<string[]>(permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, full, permissions: areas }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setMsg({ ok: true, text: "Saved. It applies from their next click." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="rounded-[12px] border border-line p-4">
      <legend className="label px-1 text-[0.7rem] text-faint">Access</legend>
      <label className="flex items-center gap-2 text-[0.88rem] text-fg">
        <input
          type="checkbox"
          checked={full}
          disabled={!canEdit}
          onChange={(e) => setFull(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Full access (everything an admin can open)
      </label>
      {!full && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {AREAS.map((a) => (
            <label key={a.key} className="flex items-start gap-2 text-[0.85rem] text-fg">
              <input
                type="checkbox"
                checked={areas.includes(a.key)}
                disabled={!canEdit}
                onChange={(e) => setAreas((cur) => (e.target.checked ? [...cur, a.key] : cur.filter((k) => k !== a.key)))}
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                {a.label}
                <span className="block text-[0.72rem] text-faint">{a.hint}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex min-h-9 items-center rounded-full bg-[var(--accent)] px-4 text-[0.85rem] font-semibold text-[#070B1A] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save access"}
          </button>
          {msg && <span className={`text-[0.8rem] ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</span>}
        </div>
      )}
    </fieldset>
  );
}

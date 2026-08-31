"use client";

import { useState } from "react";
import type { SchemaStatus } from "@/lib/db/migrator";

/**
 * The one button that unblocks a deployment whose schema was never applied.
 *
 * It reports the outcome of the run it just made, rather than telling the
 * operator to go and look somewhere else: the whole reason this screen exists
 * is that "check the logs" was not a step the person holding the problem could
 * take.
 */
export function SchemaPanel({ initial }: { initial: SchemaStatus }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/schema", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        applied?: string[];
        error?: string;
        status?: SchemaStatus;
      };
      if (data.status) setStatus(data.status);
      setResult(
        data.ok
          ? {
              ok: true,
              text: data.applied?.length
                ? `Applied ${data.applied.length} migration${
                    data.applied.length === 1 ? "" : "s"
                  }: ${data.applied.join(", ")}`
                : "Nothing to apply — the schema was already up to date.",
            }
          : { ok: false, text: data.error ?? "The run failed." }
      );
    } catch {
      setResult({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const tone: Record<string, string> = {
    applied: "text-moss-300",
    pending: "text-amber-300",
    changed: "text-red-300",
  };

  return (
    <div className="space-y-6">
      {!status.reachable && (
        <p className="rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 p-4 text-[0.9rem] leading-relaxed text-red-200">
          {status.error ?? "The database could not be reached."}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-[0.88rem]">
          <thead>
            <tr className="border-b border-line text-faint">
              <th className="pb-2 font-medium">Migration</th>
              <th className="pb-2 font-medium">State</th>
              <th className="pb-2 font-medium">Applied</th>
            </tr>
          </thead>
          <tbody>
            {status.migrations.map((m) => (
              <tr key={m.name} className="border-b border-line/60">
                <td className="py-2.5 pr-4 font-mono text-[0.8rem] text-fg">{m.name}</td>
                <td className={`py-2.5 pr-4 ${tone[m.status] ?? "text-muted"}`}>
                  {m.status === "changed" ? "edited since applied" : m.status}
                </td>
                <td className="py-2.5 text-faint">
                  {m.appliedAt ? new Date(m.appliedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status.changed > 0 && (
        <p className="rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 p-4 text-[0.88rem] leading-relaxed text-red-200">
          A migration has been edited since it was applied. Applying will refuse
          rather than run the new text over an old database — add a new
          migration instead.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={apply}
          disabled={busy || !status.reachable || status.pending === 0}
          className="label inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Applying…"
            : status.pending === 0
              ? "Nothing pending"
              : `Apply ${status.pending} pending migration${status.pending === 1 ? "" : "s"}`}
        </button>
        <span className="text-[0.82rem] text-faint">
          Safe to press twice — applied migrations are recorded and skipped.
        </span>
      </div>

      {result && (
        <p
          className={`rounded-[var(--radius-sm)] border p-4 text-[0.88rem] leading-relaxed ${
            result.ok
              ? "border-moss-500/40 bg-moss-500/10 text-moss-200"
              : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}

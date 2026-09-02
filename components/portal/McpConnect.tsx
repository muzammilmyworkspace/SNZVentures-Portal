"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { McpToken } from "@/lib/db/repos/mcp-tokens";
import type { Grant } from "@/lib/db/repos/oauth";

/**
 * CONNECTING YOUR OWN CLAUDE TO THE PORTAL.
 *
 * The screen exists because the setup is otherwise three steps in two places —
 * make a key, know the URL, get the flag names right — and the third is where
 * people give up. Pressing the button produces the whole command, already
 * carrying the key and this deployment's own address, to paste into a
 * terminal. Nothing has to be typed and nothing has to be looked up.
 *
 * THE KEY IS SHOWN ONCE. Not a design flourish: only its hash is stored, so
 * there is nothing to show a second time. The screen has to say so plainly at
 * the moment it matters, because somebody who closes the panel expecting to
 * come back for it later has lost it, and will assume the feature is broken
 * rather than that they were warned.
 */
export function McpConnect({
  tokens,
  grants,
  origin,
  sharedTokenSet,
}: {
  tokens: McpToken[];
  /**
   * Connections approved through OAuth — claude.ai, the desktop app, the
   * phone. Listed beside the keys rather than on a page of their own: the
   * question "what can read our clients' files, and how do I stop it" should
   * have exactly one place to look.
   */
  grants: Grant[];
  /** This deployment's own address, so the command is correct wherever it runs. */
  origin: string;
  /** Whether the old shared MCP_TOKEN is still set on this deployment. */
  sharedTokenSet: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const command = fresh
    ? `claude mcp add --transport http --scope user snz-portal ${origin}/api/mcp --header "Authorization: Bearer ${fresh}"`
    : "";

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That did not work.");
      } else {
        setFresh(data.token);
        setLabel("");
        router.refresh();
      }
    } catch {
      setError("That did not work. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Withdraw "${name}"? Any Claude using it stops working immediately.`)) return;
    setBusy(true);
    await fetch(`/api/admin/mcp?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  async function disconnect(clientId: string, name: string) {
    if (!confirm(`Disconnect "${name}"? It stops being able to read anything immediately.`)) return;
    setBusy(true);
    await fetch(`/api/admin/oauth?clientId=${encodeURIComponent(clientId)}`, {
      method: "DELETE",
    }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused. The command is on screen and
      // selectable either way, so this is not worth an error message.
    }
  }

  return (
    <div className="space-y-5">
      {fresh && (
        <div className="rounded-[var(--radius-sm)] border border-moss-500/40 bg-moss-500/[0.08] p-4">
          <p className="text-[0.88rem] font-semibold text-ok">
            Your key is ready. Copy this now — it cannot be shown again.
          </p>
          <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">
            Paste it into a terminal on the computer you use Claude Code on. Only the key&rsquo;s
            fingerprint is stored here, so if you lose it, withdraw it and make another.
          </p>

          <pre className="mt-3 overflow-x-auto rounded-[var(--radius-sm)] border border-line bg-raised p-3 font-mono text-[0.72rem] leading-relaxed text-fg">
            {command}
          </pre>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300"
            >
              {copied ? "Copied" : "Copy the command"}
            </button>
            <button
              type="button"
              onClick={() => setFresh(null)}
              className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-muted transition-colors hover:text-fg"
            >
              I have saved it
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 p-3 text-[0.84rem] text-danger">
          {error}
        </p>
      )}

      {/*
        Approved through the browser rather than pasted into a terminal. Shown
        first because it is the one somebody is most likely to have forgotten
        about: a key is on a laptop you can see, a grant lives on a service.
      */}
      {grants.length > 0 && (
        <div>
          <p className="label mb-2 text-faint">Connected through claude.ai</p>
          <ul className="divide-y divide-line border-y border-line">
            {grants.map((g) => (
              <li key={g.clientId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 grow">
                  <p className="truncate text-[0.88rem] font-semibold text-fg">{g.clientName}</p>
                  <p className="text-[0.78rem] text-faint">
                    Approved {new Date(g.grantedAt).toLocaleDateString()} ·{" "}
                    {g.lastUsedAt
                      ? `last used ${new Date(g.lastUsedAt).toLocaleDateString()}`
                      : "never used"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => disconnect(g.clientId, g.clientName)}
                  className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-red-500/40 px-4 text-danger transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 grow">
                <p className="truncate text-[0.88rem] font-semibold text-fg">{t.label}</p>
                <p className="text-[0.78rem] text-faint">
                  Created {new Date(t.createdAt).toLocaleDateString()} · Expires{" "}
                  {new Date(t.expiresAt).toLocaleDateString()} ·{" "}
                  {/* A key nobody has used is one that can be withdrawn without
                      asking anybody, which is the only way old keys ever go. */}
                  {t.lastUsedAt
                    ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(t.id, t.label)}
                className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-red-500/40 px-4 text-danger transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="grow">
          <span className="label mb-1.5 block text-faint">Name this key</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="e.g. Office laptop"
            className="min-h-11 w-full rounded-[var(--radius-sm)] border border-line bg-raised px-3 text-[0.88rem] text-fg placeholder:text-faint"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={create}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
        >
          {busy ? "Working…" : "Create a key"}
        </button>
      </div>

      <p className="text-[0.8rem] leading-relaxed text-faint">
        Name it after the computer it will live on. When that laptop is replaced, you will know
        which key to withdraw without having to withdraw them all.
      </p>

      {/*
        THE SHARED KEY IS A DIFFERENT THING AND SHOULD NOT SURVIVE THIS.

        MCP_TOKEN belongs to nobody, so the audit log can record that a
        passport number was read and not say by whom; it cannot be withdrawn
        from one person; and changing it needs a redeploy. It is worth saying
        so on the screen that replaces it, or it stays set forever.
      */}
      {sharedTokenSet && (
        <p className="rounded-[var(--radius-sm)] border border-amber-300/40 bg-amber-300/[0.06] p-4 text-[0.84rem] leading-relaxed text-fg">
          <strong className="font-semibold">A shared key is still set on this deployment.</strong>{" "}
          The <code>MCP_TOKEN</code> environment variable works, but it belongs to nobody: the
          record of what it read cannot name a person, it cannot be withdrawn from one person
          without cutting off everyone, and changing it needs a redeploy. Once everyone here has
          their own key above, remove that variable in Vercel.
        </p>
      )}
    </div>
  );
}

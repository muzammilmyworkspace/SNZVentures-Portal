"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Connect or disconnect the firm's Drive.
 *
 * "Reconnect" is a distinct state from "connect". A token that will not open
 * means AUTH_SECRET was rotated, not that nobody ever connected — and telling
 * somebody who set this up last week that it was never connected sends them
 * looking for a problem that is not there.
 */
export function DriveConnect({
  connected,
  unreadable,
  accountEmail,
  connectedAt,
  configured,
  folderName,
}: {
  connected: boolean;
  unreadable: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  configured: boolean;
  folderName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Disconnect Google Drive? Files already there stay where they are.")) return;
    setBusy(true);
    await fetch("/api/admin/drive", { method: "DELETE" }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  if (!configured) {
    return (
      <p className="text-[0.88rem] leading-relaxed text-muted">
        This deployment has no Google OAuth client configured, so Drive cannot be connected.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            connected ? "bg-moss-400" : unreadable ? "bg-amber-300" : "bg-line-strong"
          }`}
        />
        <p className="text-[0.95rem] font-semibold text-fg">
          {connected ? "Connected" : unreadable ? "Needs reconnecting" : "Not connected"}
        </p>
      </div>

      {connected && (
        <p className="text-[0.86rem] leading-relaxed text-muted">
          Files are written to <span className="text-fg">{folderName}</span> in{" "}
          <span className="text-fg">{accountEmail ?? "the connected account"}</span>
          {connectedAt && ` · connected ${new Date(connectedAt).toLocaleDateString()}`}.
        </p>
      )}

      {unreadable && (
        <p className="rounded-[var(--radius-sm)] border border-amber-300/40 bg-amber-300/[0.07] p-4 text-[0.86rem] leading-relaxed text-fg">
          The stored credential can no longer be read, which happens when{" "}
          <code>AUTH_SECRET</code> is rotated. Nothing is lost — the folder and its files are still
          in Drive. Connect again to resume exporting.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href="/api/admin/drive"
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
        >
          {connected || unreadable ? "Reconnect" : "Connect Google Drive"}
        </a>
        {(connected || unreadable) && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5 text-muted transition-colors hover:border-red-400/50 hover:text-danger disabled:opacity-50"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>
    </div>
  );
}

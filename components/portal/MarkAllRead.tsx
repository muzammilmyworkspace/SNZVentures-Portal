"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Clears every unread notification for the signed-in user.
 *
 * The API takes no user id — it always acts on the session — so there is no
 * parameter here that could be pointed at someone else's inbox.
 */
export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/portal/notifications", { method: "PATCH" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent disabled:opacity-60"
    >
      {busy ? "Clearing…" : "Mark all read"}
    </button>
  );
}

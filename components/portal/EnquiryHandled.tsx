"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The answered switch on an enquiry row: a tick to mark it, a tag to undo. */
export function EnquiryHandled({ id, handledAt }: { id: string; handledAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const done = Boolean(handledAt);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/enquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, handled: !done }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={done}
      aria-label={done ? "Answered. Click to mark not answered" : "Mark as answered"}
      data-tip={done ? "Answered (click to undo)" : "Mark as answered"}
      className={`tip icon-btn ${done ? "!border-[var(--accent)] !bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] !text-accent" : ""}`}
    >
      {busy ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      )}
    </button>
  );
}

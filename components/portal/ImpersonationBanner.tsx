"use client";

import { useState } from "react";

/**
 * THE BAR THAT MAKES A VIEW-AS IMPOSSIBLE TO FORGET.
 * ---------------------------------------------------------------------------
 * The danger of this feature is not that it exists; it is somebody wandering
 * off, coming back an hour later and acting as a client without realising it.
 * So the bar is at the very top of every page, in a colour used nowhere else
 * in the portal, and it names the person being viewed rather than saying
 * something vague like "impersonation active".
 *
 * It sits ABOVE the layout rather than inside a panel, and it is not
 * dismissible. A support tool you can hide is a support tool you will forget
 * you left on.
 */
export function ImpersonationBanner({
  viewing,
  admin,
}: {
  viewing: { name: string; email: string };
  admin: { name: string };
}) {
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    try {
      const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { redirectTo?: string };
      /*
        A full load, not a router push. The session cookie has just been
        swapped for a different person's, and every server component already
        rendered belongs to the client we were viewing. Re-requesting the
        document is the only way to be sure nothing of theirs is still on
        screen.
      */
      window.location.assign(data.redirectTo ?? "/portal/admin/users");
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div className="sticky top-0 z-[60] border-b border-amber-300/50 bg-[#B4761E] text-white [html[data-theme=dark]_&]:bg-[#5A3A0A]">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/50 text-[0.65rem] font-bold"
        >
          !
        </span>

        <p className="min-w-0 flex-1 text-[0.85rem] leading-snug">
          <span className="font-semibold">Viewing as {viewing.name}</span>
          <span className="hidden opacity-90 sm:inline"> · {viewing.email}</span>
          <span className="block opacity-90 sm:inline">
            <span className="hidden sm:inline"> · </span>
            Anything you do here is recorded against {admin.name}.
          </span>
        </p>

        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="label shrink-0 rounded-[var(--radius-sm)] bg-white px-4 py-2 text-[0.7rem] text-[#7A4A02] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {leaving ? "Leaving…" : "Back to my account"}
        </button>
      </div>
    </div>
  );
}

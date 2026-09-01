"use client";

import { useState } from "react";

/**
 * THE BAR THAT MAKES A LOGIN-AS IMPOSSIBLE TO FORGET.
 * ---------------------------------------------------------------------------
 * The danger of this feature is not that it exists; it is somebody wandering
 * off, coming back an hour later and acting as a client without realising it.
 * So the bar sits above every page, is not dismissible, and names the person
 * being viewed rather than saying something vague like "impersonation active".
 *
 * IT IS A NEUTRAL DARK BAR, not a coloured warning. The first version was a
 * solid amber strip, and a full-width block of warning colour above a portal
 * that already uses amber for "with us" read as an error the whole time it was
 * on screen — which is both wrong and, being constant, quickly ignored. The
 * signal is carried by one amber dot and the wording instead, on a surface
 * that plainly is not part of the client's portal.
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
      /*
        Put the button back. It was left saying "Leaving…" for ever when the
        request failed, so the one control that gets somebody out of a client's
        account looked broken at exactly the moment it was needed.
      */
      setLeaving(false);
    }
  }

  return (
    <div className="sticky top-0 z-[60] border-b border-white/10 bg-[#0B1220] text-white">
      <div className="mx-auto flex max-w-[100rem] items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6 lg:px-8">
        <span
          aria-hidden
          className="relative flex h-2 w-2 shrink-0"
          title="Signed in as another user"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
        </span>

        <p className="min-w-0 flex-1 truncate text-[0.82rem] leading-snug">
          <span className="text-white/60">Signed in as</span>{" "}
          <span className="font-semibold">{viewing.name}</span>
          <span className="hidden text-white/50 sm:inline"> · {viewing.email}</span>
          <span className="hidden text-white/50 lg:inline">
            {" "}
            · recorded against {admin.name}
          </span>
        </p>

        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="label shrink-0 rounded-[var(--radius-sm)] bg-white/95 px-3.5 py-1.5 text-[0.68rem] text-[#0B1220] transition-opacity hover:opacity-85 disabled:opacity-60"
        >
          {leaving ? "Leaving…" : "Exit"}
        </button>
      </div>
    </div>
  );
}

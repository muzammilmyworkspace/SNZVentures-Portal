"use client";

import { useEffect } from "react";

/**
 * Tells the server this tab is still open, so the session does not lapse
 * under somebody who is reading rather than clicking.
 *
 * The session expires from inactivity (see lib/auth/constants). Navigation
 * alone is a poor signal for that — reading one case file for forty minutes
 * involves none — so an open, VISIBLE tab is the signal instead. It is also
 * the closest available answer to the real question: is this person still
 * here.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not run while the tab is hidden. That is the whole mechanism: a tab
 * left behind, or a browser closed, stops saying "still here" and the session
 * lapses on its own. A timer that kept firing in the background would recreate
 * exactly the behaviour being fixed, one layer further down.
 *
 * It cannot extend a session past its absolute ceiling — the server carries
 * that value forward untouched — so this is not a way to stay signed in for
 * ever by leaving a tab open.
 */

/** Comfortably inside the idle window, so one missed ping is not a sign-out. */
const EVERY_MS = 5 * 60 * 1000;

export function SessionKeepalive() {
  useEffect(() => {
    let stopped = false;

    async function ping() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/auth/touch", { method: "POST" });
        /*
          401 means it lapsed anyway — the tab was hidden long enough, or the
          ceiling was reached, or an administrator ended the session. Reload
          rather than route: the whole page belongs to a session that no longer
          exists, and the proxy sends the fresh request to sign-in.
        */
        if (res.status === 401) window.location.reload();
      } catch {
        // Offline or a blip. The next tick tries again; one miss is survivable
        // by design, which is why the interval is a fraction of the window.
      }
    }

    const timer = setInterval(ping, EVERY_MS);

    /*
      Also on becoming visible again. Someone returning to a tab after twenty
      minutes should have their session confirmed at that moment rather than
      up to five minutes later — and if it has already lapsed, they should be
      told now instead of part way through typing.
    */
    const onVisible = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

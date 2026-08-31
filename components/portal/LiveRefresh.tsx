"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * KEEP THE PAGE CURRENT WITHOUT ASKING ANYONE TO RELOAD.
 * ---------------------------------------------------------------------------
 * A student sends their receipt, leaves the tab open, and an advisor verifies
 * it ten minutes later. Nothing on their screen changed, so as far as they are
 * concerned nothing happened — and the next thing that happens is an email
 * asking why the portal still says it is waiting.
 *
 * This re-fetches the server components on the two occasions the answer can
 * have changed under them: coming back to the tab, and sitting on it long
 * enough for somebody else to have acted.
 *
 * WHY NOT SOCKETS. The events here are minutes apart and staff-driven — a fee
 * verified, a document reviewed, a message sent. A persistent connection per
 * signed-in student, on serverless, to deliver something that happens twice a
 * week is a great deal of machinery for a problem a refresh solves.
 *
 * WHY IT IS CHEAP. `router.refresh()` re-runs the server render and diffs it
 * into the existing tree; it does not reload the document, lose scroll
 * position, or disturb anything typed into a form. And it only ever fires
 * while the tab is actually visible, so a portal left open in a background tab
 * overnight makes no requests at all.
 */
export function LiveRefresh({ everySeconds = 90 }: { everySeconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), everySeconds * 1000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Straight away, because the interesting case is somebody returning to
        // the tab specifically to see whether anything has moved.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [router, everySeconds]);

  return null;
}

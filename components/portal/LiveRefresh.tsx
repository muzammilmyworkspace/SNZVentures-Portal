"use client";

import { useEffect, useRef } from "react";
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
/**
 * Is the person in the middle of something a refresh would interrupt?
 *
 * `router.refresh()` keeps React state, so nothing typed is ever LOST. But
 * safe is not the same as welcome: a table reordering under a half-filled form,
 * or behind an open dialog, reads as the page fighting whoever is using it.
 * The next tick is seconds away, so waiting costs nothing.
 *
 * This also guards the focus listener below, which fires every time somebody
 * clicks back into the window — including mid-sentence.
 */
function busy(): boolean {
  if (typeof document === "undefined") return true;

  // A modal is open, so the person is doing the thing it was opened for.
  if (document.querySelector("dialog[open]")) return true;

  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return true;
  if (el.isContentEditable) return true;

  return false;
}

export function LiveRefresh({ everySeconds = 30 }: { everySeconds?: number }) {
  const router = useRouter();

  /*
    Held in a ref so the effect subscribes once. With `router` in the deps it
    tore down and rebuilt the timer on every navigation, which on the staff
    side — where people move between queues constantly — meant the interval
    almost never survived long enough to fire.
  */
  const refresh = useRef(() => router.refresh());
  refresh.current = () => router.refresh();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (document.visibilityState !== "visible" || busy()) return;
      refresh.current();
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(tick, everySeconds * 1000);
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
        tick();
        start();
      } else {
        stop();
      }
    };

    // Whatever is on screen is at least as old as the outage.
    const onOnline = () => tick();

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [everySeconds]);

  return null;
}

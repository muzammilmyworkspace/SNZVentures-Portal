"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Esc closes a window that is opened by the URL (review, documents, history):
 * it goes to the same address without the window's parameter. Renders nothing.
 */
export function EscapeTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Leave Esc to an open native dialog or a field the user is typing in.
      const t = e.target as HTMLElement | null;
      if (t?.closest("dialog[open]")) return;
      router.push(href, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [href, router]);
  return null;
}

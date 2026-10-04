"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders its children only after hydration.
 *
 * WHY. Password-manager extensions (LastPass in particular) inject their icon
 * node next to every email and password field the moment the HTML arrives,
 * before React hydrates. React then finds a node it never rendered, reports a
 * hydration mismatch and throws the server tree away. Keeping the sign-in
 * forms out of the server HTML leaves the extension nothing to touch until
 * React owns the DOM. A form cannot be submitted before hydration anyway.
 *
 * `fallback` should be the same size as the form so nothing jumps.
 */
export function AfterMount({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback ?? null}</>;
}

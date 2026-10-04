"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * `useReducedMotion`, safe to branch on during render.
 *
 * The raw hook returns null on the server and the real preference on the
 * client, so any component that renders differently under reduced motion
 * produced different HTML on each side — a hydration mismatch, and React
 * throwing the server tree away. This returns false for the first (hydrating)
 * render on both sides, then the real value once mounted.
 *
 * The brief gap is covered by <MotionConfig reducedMotion="user"> on the
 * homepage: anything that does start animating in that first frame for a
 * reduced-motion visitor completes instantly instead.
 */
export function useReduced(): boolean {
  const pref = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? Boolean(pref) : false;
}

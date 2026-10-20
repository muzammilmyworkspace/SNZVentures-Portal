"use client";

import { useReduced } from "./useReduced";

/**
 * THE PORTAL SKY — the website's line field, quieter.
 *
 * One fixed SVG behind every portal page: a faint chart grid and three long
 * sine waves drifting sideways. It is deliberately dimmer than the website's
 * (people work in here for long stretches; the background must never compete
 * with a table). Transform-only animation, still under reduced motion, and
 * pointer-events none so it can never block a control.
 */

function wave(y: number, a: number, l: number) {
  let d = `M0 ${y}`;
  for (let x = 0, up = true; x < 2880; x += l / 2, up = !up) {
    d += ` Q ${x + l / 4} ${up ? y - a : y + a} ${x + l / 2} ${y}`;
  }
  return d;
}
const WAVES = [
  { y: 300, a: 26, l: 480, s: 48, rev: false },
  { y: 620, a: 36, l: 720, s: 62, rev: true },
  { y: 860, a: 20, l: 360, s: 40, rev: false },
];

export function PortalBackdrop() {
  const reduce = useReduced();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-[15%] -top-[25%] h-[60vh] w-[60vw] rounded-full bg-[radial-gradient(closest-side,rgba(61,113,201,0.16),transparent)]" />
      <div className="absolute -bottom-[30%] -right-[10%] h-[60vh] w-[55vw] rounded-full bg-[radial-gradient(closest-side,rgba(114,196,60,0.08),transparent)]" />
      <svg viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="portal-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0H0V80" fill="none" style={{ stroke: "var(--portal-grid)" }} strokeWidth="1" />
          </pattern>
          <linearGradient id="portal-wave" x1="0" x2="1">
            <stop offset="0" stopColor="#6FA6F7" stopOpacity="0" />
            <stop offset="0.35" stopColor="#6FA6F7" stopOpacity="1" />
            <stop offset="0.7" stopColor="#72C43C" stopOpacity="1" />
            <stop offset="1" stopColor="#72C43C" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1440" height="960" fill="url(#portal-grid)" />
        {WAVES.map((w) => (
          <path
            key={w.y}
            d={wave(w.y, w.a, w.l)}
            fill="none"
            stroke="url(#portal-wave)"
            strokeWidth="1.2"
            style={{ opacity: "var(--portal-wave-o)", animationDuration: `${w.s}s`, animationDirection: w.rev ? "reverse" : "normal" }}
            className={reduce ? undefined : "portal-wave"}
          />
        ))}
      </svg>
    </div>
  );
}

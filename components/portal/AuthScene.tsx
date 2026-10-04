"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReduced } from "./useReduced";

/**
 * THE SIGN-IN SCENE — the website's Boarding Pass, continued into the portal.
 *
 * Two pieces, both decorative (aria-hidden), both still under reduced motion:
 *
 *   AuthSky   the night sky: a faint chart grid, great-circle arcs that draw
 *             themselves, and long sine waves drifting sideways. Same visual
 *             language as the background of snzventures.com, so signing in
 *             feels like walking through the gate rather than leaving the site.
 *
 *   AuthPass  a boarding pass whose status steps through the real portal
 *             journey (fee, application, documents, offer, visa) with a stamp
 *             landing on each, then the plane takes off along the dashed route.
 *             It names stages, never a person or an outcome.
 */

const ARCS = [
  "M-40 700 C 240 330, 600 260, 1000 420",
  "M-60 260 C 300 110, 700 140, 1040 60",
  "M80 900 C 380 520, 720 600, 1060 820",
];

/** A smooth sine, two viewBox widths long, so a -1000px slide loops seamlessly. */
function wave(y: number, a: number, l: number) {
  let d = `M0 ${y}`;
  for (let x = 0, up = true; x < 2000; x += l / 2, up = !up) {
    d += ` Q ${x + l / 4} ${up ? y - a : y + a} ${x + l / 2} ${y}`;
  }
  return d;
}
const WAVES = [
  { y: 230, a: 22, l: 400, o: 0.22, s: 34, rev: false },
  { y: 520, a: 34, l: 500, o: 0.16, s: 46, rev: true },
  { y: 760, a: 18, l: 250, o: 0.2, s: 28, rev: false },
];

export function AuthSky() {
  const reduce = useReduced();
  return (
    <svg aria-hidden viewBox="0 0 1000 900" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <pattern id="auth-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M60 0H0V60" fill="none" stroke="rgb(170 190 230 / 0.06)" strokeWidth="1" />
        </pattern>
        <linearGradient id="auth-arc" x1="0" x2="1">
          <stop offset="0" stopColor="#6FA6F7" stopOpacity="0" />
          <stop offset="0.5" stopColor="#6FA6F7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#72C43C" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect width="1000" height="900" fill="url(#auth-grid)" />
      {ARCS.map((d, i) => (
        <g key={d}>
          <path d={d} fill="none" stroke="rgb(170 190 230 / 0.08)" strokeDasharray="2 6" />
          <motion.path
            d={d}
            fill="none"
            stroke="url(#auth-arc)"
            strokeWidth="1.3"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.3 + i * 0.35, duration: 2.4, ease: [0.65, 0, 0.35, 1] }}
          />
        </g>
      ))}
      {WAVES.map((w) => (
        <path
          key={w.y}
          d={wave(w.y, w.a, w.l)}
          fill="none"
          stroke="url(#auth-arc)"
          strokeWidth="1.2"
          opacity={w.o}
          className={reduce ? undefined : "auth-wave"}
          style={{ animationDuration: `${w.s}s`, animationDirection: w.rev ? "reverse" : "normal" }}
        />
      ))}
    </svg>
  );
}

const STAGES = [
  { label: "Fee verified", stamp: "Verified", tone: "#0E8A63" },
  { label: "Application", stamp: "Submitted", tone: "#1D4ED8" },
  { label: "Documents", stamp: "Approved", tone: "#0E8A63" },
  { label: "Offer", stamp: "Accepted", tone: "#0E8A63" },
  { label: "Visa", stamp: "Issued", tone: "#1D4ED8" },
];

export function AuthPass() {
  const reduce = useReduced();
  const [i, setI] = useState(STAGES.length - 1);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    if (reduce) return;
    setI(0);
    let n = 0;
    const t = window.setInterval(() => {
      n = (n + 1) % (STAGES.length + 2);
      setFlying(n >= STAGES.length);
      setI(Math.min(n, STAGES.length - 1));
      if (n === 0) setFlying(false);
    }, 1700);
    return () => window.clearInterval(t);
  }, [reduce]);

  const s = STAGES[i];
  return (
    <div aria-hidden className="relative w-full max-w-[460px]">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 40, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={{ delay: 0.5, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        className="bp-ticket relative grid grid-cols-[70%_30%] text-[var(--color-ticket-ink)] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
        style={{ ["--tear" as string]: "70%" }}
      >
        <div className="bp-ticket-tear" />
        <div className="p-5">
          <span className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[rgb(18_23_38/0.62)]">Boarding pass</span>
          <div className="mt-3 flex items-end gap-4">
            <span>
              <span className="block font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[rgb(18_23_38/0.62)]">From</span>
              <span className="font-[family-name:var(--font-display)] text-[1.7rem] font-bold leading-none">HOME</span>
            </span>
            <svg viewBox="0 0 24 24" className="mb-1 h-5 w-5 text-[#3D71C9]" fill="currentColor">
              <path d="M22.5 12c0-.8-.7-1.4-1.6-1.4h-5.4L10.3 2.3a.8.8 0 00-.7-.4H8.2c-.4 0-.6.4-.5.7l2.6 8H5.1L3.4 8.2a.6.6 0 00-.5-.3H1.8c-.3 0-.5.3-.4.6L2.6 12l-1.2 3.5c-.1.3.1.6.4.6h1.1c.2 0 .4-.1.5-.3l1.7-2.4h5.2l-2.6 8c-.1.3.1.7.5.7h1.4c.3 0 .5-.2.7-.4l5.2-8.3h5.4c.9 0 1.6-.6 1.6-1.4z" />
            </svg>
            <span>
              <span className="block font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[rgb(18_23_38/0.62)]">To</span>
              <span className="font-[family-name:var(--font-display)] text-[1.7rem] font-bold leading-none">EUROPE</span>
            </span>
          </div>
          {/* Stage track */}
          <div className="mt-4 flex gap-1">
            {STAGES.map((st, k) => (
              <span
                key={st.label}
                className="h-1.5 flex-1 rounded-full transition-colors duration-500"
                style={{ background: k <= i ? "#2F6B12" : "rgb(18 23 38 / 0.12)" }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[rgb(18_23_38/0.62)]">Stage</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={s.label}
                initial={reduce ? false : { y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-[0.9rem] font-bold"
              >
                {flying ? "Ready to fly" : s.label}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <div className="relative flex flex-col justify-between p-4">
          <span className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[rgb(18_23_38/0.62)]">Gate</span>
          <span className="font-[family-name:var(--font-display)] text-[1.6rem] font-bold">SNZ</span>
          <span className="bp-barcode h-8" />
        </div>

        {/* The stamp for the current stage */}
        <AnimatePresence mode="wait">
          <motion.span
            key={flying ? "fly" : s.stamp}
            initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -22 }}
            animate={{ scale: 1, opacity: 0.92, rotate: -12 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 22 }}
            className="absolute right-[33%] top-[8%] rounded-[8px] border-[2.5px] px-3 py-1 font-mono text-[0.85rem] font-bold uppercase tracking-[0.16em] mix-blend-multiply"
            style={{ color: flying ? "#C2410C" : s.tone, borderColor: flying ? "#C2410C" : s.tone }}
          >
            {flying ? "Boarding" : s.stamp}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* The route and the plane */}
      <svg viewBox="0 0 460 120" className="mt-6 w-full overflow-visible">
        <path d="M10 100 C 140 100, 260 60, 450 12" fill="none" stroke="rgb(170 190 230 / 0.28)" strokeDasharray="3 7" strokeWidth="1.4" />
        <motion.path
          d="M10 100 C 140 100, 260 60, 450 12"
          fill="none"
          stroke="#72C43C"
          strokeWidth="2"
          strokeLinecap="round"
          animate={{ pathLength: reduce ? 1 : flying ? 1 : (i + 1) / (STAGES.length + 1) }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
    </div>
  );
}

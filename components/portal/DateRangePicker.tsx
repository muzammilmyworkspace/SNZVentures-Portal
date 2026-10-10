"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS, presetDates, rangeText, type RangePreset } from "@/lib/portal/finance-range";

/**
 * THE REPORT'S DATE FILTER, like an ads manager's: one button showing the
 * range; it opens the ready ranges on the left and two dates on the right.
 * Choosing a ready range applies it at once; two dates apply with Update.
 */
export function DateRangePicker({
  path,
  preset,
  from,
  to,
  today,
}: {
  path: string;
  preset: RangePreset | "custom";
  from: string;
  to: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<RangePreset | "custom">(preset);
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const go = (q: string) => {
    setOpen(false);
    router.push(`${path}?${q}`);
  };
  const label = preset === "custom" ? "Custom" : RANGE_PRESETS.find(([k]) => k === preset)?.[1];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setPick(preset);
          setA(from);
          setB(to);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2.5 rounded-[12px] border border-line bg-[var(--panel-solid)] px-4 text-left transition-colors hover:border-[var(--accent)]"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="2" />
          <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
        </svg>
        <span>
          <span className="block text-[0.72rem] text-faint">{label}</span>
          <span className="block text-[0.9rem] font-semibold text-fg">{rangeText(from, to)}</span>
        </span>
        <svg viewBox="0 0 12 12" className={cn("ml-1 h-3 w-3 text-muted transition-transform", open && "rotate-180")} aria-hidden>
          <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose the dates"
          className="absolute left-0 z-[60] mt-2 flex w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[16px] border border-line bg-[var(--panel-solid)] shadow-2xl sm:flex-row"
        >
          <ul className="flex max-h-72 flex-row flex-wrap gap-1 border-b border-line p-2 sm:max-h-none sm:w-48 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
            {RANGE_PRESETS.map(([k, name]) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    setPick(k);
                    const d = presetDates(k, today);
                    setA(d.from);
                    setB(d.to);
                    go(`range=${k}`);
                  }}
                  className={cn(
                    "w-full rounded-[8px] px-3 py-2 text-left text-[0.86rem] transition-colors",
                    pick === k ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-semibold text-accent" : "text-fg hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]"
                  )}
                >
                  {name}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setPick("custom")}
                className={cn(
                  "w-full rounded-[8px] px-3 py-2 text-left text-[0.86rem] transition-colors",
                  pick === "custom" ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-semibold text-accent" : "text-fg hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]"
                )}
              >
                Custom
              </button>
            </li>
          </ul>
          <div className="flex flex-1 flex-col gap-4 p-4">
            <p className="text-[0.82rem] text-muted">Pick a ready range on the left, or choose any two dates.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">From</span>
                <input
                  type="date"
                  value={a}
                  max={b || undefined}
                  onChange={(e) => {
                    setA(e.target.value);
                    setPick("custom");
                  }}
                  className="field"
                />
              </label>
              <label className="block">
                <span className="field-label">To</span>
                <input
                  type="date"
                  value={b}
                  min={a || undefined}
                  onChange={(e) => {
                    setB(e.target.value);
                    setPick("custom");
                  }}
                  className="field"
                />
              </label>
            </div>
            <div className="mt-auto flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.86rem] text-muted hover:text-fg">
                Cancel
              </button>
              <button
                type="button"
                disabled={!a || !b}
                onClick={() => go(`from=${a}&to=${b}`)}
                className="inline-flex min-h-10 items-center rounded-full bg-moss-400 px-5 text-[0.86rem] font-semibold text-[#070B1A] hover:bg-moss-300 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

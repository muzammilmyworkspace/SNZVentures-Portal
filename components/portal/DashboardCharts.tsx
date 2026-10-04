"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReduced } from "./useReduced";
import { cn } from "@/lib/utils";
import { STAGES, STAGE_BY_KEY } from "@/lib/portal/advisor-stages";

/**
 * THE ADMIN DASHBOARD CHARTS.
 *
 * Built to the dataviz skill's rules:
 *   - categorical colours in fixed order from validated tokens (--viz-1..3,
 *     app/boarding.css), never cycled; text stays in text tokens
 *   - one y-axis per chart, recessive grid, thin marks (2px lines, >= 8px
 *     markers, 4px rounded bar ends, 2px gaps)
 *   - two series: legend AND direct end-labels; every bar carries its value
 *   - hover layer: crosshair + tooltip on the line chart, per-bar tooltip on
 *     bars, with hit targets larger than the marks
 *   - a visually hidden table for each chart, so nothing is colour-only
 * Marks draw in on mount; under reduced motion they render complete.
 */

type Point = { day: string; signups: number; submitted: number };

const fmtWeek = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/* --------------------------------------------------------------- line chart */

export function ActivityChart({
  points: weeks,
  bucket = "day",
  rangeText,
}: {
  points: Point[];
  bucket?: "day" | "week";
  rangeText: string;
}) {
  const per = bucket === "week" ? "per week" : "per day";
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 7));
  const reduce = useReduced();
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<SVGSVGElement>(null);

  const W = 640;
  const H = 220;
  const pad = { l: 34, r: 92, t: 14, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const max = Math.max(4, ...weeks.map((w) => Math.max(w.signups, w.submitted)));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => pad.l + (weeks.length <= 1 ? iw / 2 : (i / (weeks.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / nice) * ih;

  const series = [
    { key: "signups" as const, label: "New clients", color: "var(--viz-1)" },
    { key: "submitted" as const, label: "Applications submitted", color: "var(--viz-2)" },
  ];

  const paths = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        d: weeks.map((w, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(w[s.key]).toFixed(1)}`).join(" "),
        area:
          weeks.length > 1
            ? `M${x(0)} ${y(0)} ` +
              weeks.map((w, i) => `L${x(i).toFixed(1)} ${y(w[s.key]).toFixed(1)}`).join(" ") +
              ` L${x(weeks.length - 1)} ${y(0)} Z`
            : "",
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeks, nice]
  );

  const totals = { signups: weeks.reduce((n, w) => n + w.signups, 0), submitted: weeks.reduce((n, w) => n + w.submitted, 0) };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || weeks.length === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / iw) * (weeks.length - 1));
    setHover(Math.max(0, Math.min(weeks.length - 1, i)));
  };

  const h = hover !== null ? weeks[hover] : null;

  return (
    <figure className="m-0">
      {/* Legend, always present for two series */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[0.85rem] text-muted">
            <span className="h-[3px] w-5 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="num text-fg-strong">{totals[s.key]}</span>
          </span>
        ))}
        <span className="label ml-auto text-[0.72rem] text-faint">{rangeText}</span>
      </div>

      <div className="relative mt-3">
        <svg
          ref={box}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={`New clients and applications submitted ${per}, ${rangeText}. Totals: ${totals.signups} new clients, ${totals.submitted} applications.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* grid + y labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(nice * t)} y2={y(nice * t)} stroke="var(--viz-grid)" strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={pad.l - 8} y={y(nice * t) + 4} textAnchor="end" className="fill-[var(--fg-faint)] font-mono text-[10px]">
                {Math.round(nice * t)}
              </text>
            </g>
          ))}
          {/* x labels: about seven across, counted back from the newest */}
          {weeks.map((w, i) =>
            (weeks.length - 1 - i) % labelEvery === 0 ? (
              <text key={w.day} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--fg-faint)] font-mono text-[10px]">
                {fmtWeek(w.day)}
              </text>
            ) : null
          )}

          {/* areas + lines */}
          {paths.map((s, k) => (
            <g key={s.key}>
              {s.area && (
                <motion.path
                  d={s.area}
                  fill={`url(#area-${s.key})`}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 + k * 0.15, duration: 0.8 }}
                />
              )}
              <motion.path
                d={s.d}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.15 + k * 0.15, duration: 1.2, ease: [0.65, 0, 0.35, 1] }}
              />
              {/* small markers at each week; the second series is drawn as rings,
                  so when both lines coincide neither disappears */}
              {weeks.map((w, i) => (
                <circle
                  key={w.day}
                  cx={x(i)}
                  cy={y(w[s.key])}
                  r={k === 0 ? 3 : 4.5}
                  fill={k === 0 ? s.color : "none"}
                  stroke={k === 0 ? "none" : s.color}
                  strokeWidth="1.5"
                  opacity={w[s.key] > 0 && weeks.length <= 31 ? 1 : 0}
                />
              ))}
              {/* direct end label, in text ink */}
              {weeks.length > 0 && (
                <g>
                  <circle cx={x(weeks.length - 1)} cy={y(weeks[weeks.length - 1][s.key])} r="4" fill={s.color} stroke="var(--panel-solid)" strokeWidth="2" />
                  <text
                    x={x(weeks.length - 1) + 10}
                    y={y(weeks[weeks.length - 1][s.key]) + (k === 0 ? -4 : 12)}
                    className="fill-[var(--fg-muted)] text-[11px]"
                  >
                    {s.key === "signups" ? "Clients" : "Applications"}
                  </text>
                </g>
              )}
            </g>
          ))}

          {/* crosshair */}
          {h && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--fg-faint)" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(h[s.key])} r="5" fill={s.color} stroke="var(--panel-solid)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>

        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[170px] -translate-x-1/2 rounded-[10px] border border-line-strong bg-[var(--panel-solid)] px-3 py-2 shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <p className="label text-[0.72rem] text-faint">{bucket === "week" ? "Week of " : ""}{fmtWeek(h.day)}</p>
            {series.map((s) => (
              <p key={s.key} className="mt-1 flex items-center justify-between gap-4 text-[0.85rem] text-fg">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num text-fg-strong">{h[s.key]}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>New clients and applications submitted {per}</caption>
        <thead>
          <tr>
            <th>{bucket === "week" ? "Week of" : "Day"}</th>
            <th>New clients</th>
            <th>Applications submitted</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.day}>
              <td>{fmtWeek(w.day)}</td>
              <td>{w.signups}</td>
              <td>{w.submitted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* ---------------------------------------------------------------- bar chart */

export function BarList({
  title,
  rows,
  colorBy = "single",
  columns = 1,
}: {
  title: string;
  rows: { label: string; value: number }[];
  /** Lay the bars out in a grid (wide panels). */
  columns?: 1 | 2 | 3;
  /** "single": one hue (magnitude). "category": fixed categorical order (identity). */
  colorBy?: "single" | "category";
}) {
  const reduce = useReduced();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  const color = (i: number) => (colorBy === "category" ? `var(--viz-${(i % 3) + 1})` : "var(--viz-1)");

  return (
    <figure className="m-0">
      <ul className={cn("grid gap-x-8 gap-y-[10px]", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")} aria-label={title}>
        {rows.map((r, i) => {
          const pct = (r.value / max) * 100;
          const share = total ? Math.round((r.value / total) * 100) : 0;
          return (
            <li
              key={r.label}
              className={cn("relative -mx-2 rounded-[10px] px-2 py-1.5 transition-colors", hover === i && "bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <div className="flex items-baseline justify-between gap-3 text-[0.88rem]">
                <span className="flex items-center gap-2 text-fg">
                  {colorBy === "category" && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color(i) }} />}
                  {r.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="num text-[1rem] text-fg-strong">{r.value}</span>
                  <span className={cn("font-mono text-[0.72rem] text-faint transition-opacity", hover === i ? "opacity-100" : "opacity-0")}>{share}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color(i), width: `${Math.max(pct, r.value ? 3 : 0)}%`, transformOrigin: "0% 50%" }}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.2 + i * 0.07, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* ------------------------------------------------------------ advisor board */


/**
 * The consultant's students as a roster: name, a five-segment track that
 * fills to the stage they have reached, and the stage named in text (so the
 * track is never colour-only). Rows link to the client file.
 */
export function StudentRoster({
  clients,
}: {
  clients: { id: string; name: string; role: string; stage: string }[];
}) {
  const reduce = useReduced();
  const students = clients.filter((c) => c.role === "student");
  if (students.length === 0) {
    return <p className="py-2 text-[0.92rem] text-muted">No students assigned to you yet.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {students.map((c, i) => {
        const st = STAGE_BY_KEY[c.stage] ?? STAGES[0];
        const warn = c.stage === "fee_rejected";
        return (
          <li key={c.id}>
            <a
              href={`/portal/admin/users/${c.id}`}
              className="group -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-[10px] px-2 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--viz-1)_22%,transparent)] font-[family-name:var(--font-display)] text-[0.8rem] font-semibold text-fg-strong">
                  {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="truncate font-semibold text-fg">{c.name}</span>
              </span>
              <span className="col-span-2 flex gap-1 sm:col-span-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.span
                    key={n}
                    className="h-1.5 flex-1 rounded-full"
                    style={{
                      background: n <= st.step ? (warn ? "var(--warn)" : "var(--viz-3)") : "color-mix(in srgb, var(--fg) 10%, transparent)",
                      transformOrigin: "0% 50%",
                    }}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.15 + i * 0.05 + n * 0.04, duration: 0.5 }}
                  />
                ))}
              </span>
              <span
                className={cn(
                  "row-start-1 justify-self-end whitespace-nowrap rounded-full px-2.5 py-1 text-[0.75rem] font-semibold sm:col-start-3",
                  warn
                    ? "bg-[color-mix(in_srgb,var(--warn)_16%,transparent)] text-warn"
                    : st.step === 5
                      ? "bg-[color-mix(in_srgb,var(--viz-3)_18%,transparent)] text-fg-strong"
                      : "bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] text-muted"
                )}
              >
                {st.label} · {st.step}/5
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}


/* -------------------------------------------------------------- gauges */

/**
 * The student's progress at a glance: three rings that fill on load. Each
 * carries its value and a caption in text, so colour is never the only cue.
 */
export function ProgressGauges({
  items,
}: {
  items: { label: string; value: number; caption: string; href?: string }[];
}) {
  const reduce = useReduced();
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((it, i) => {
        const v = Math.max(0, Math.min(100, it.value));
        const hue = `var(--viz-${(i % 3) + 1})`;
        const body = (
          <div className="group relative flex h-full items-center gap-5 overflow-hidden rounded-[16px] border border-line bg-[image:var(--panel-bg)] p-5 shadow-[var(--panel-shadow)] transition-all duration-300 hover:-translate-y-1 hover:border-line-strong motion-reduce:transform-none">
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] opacity-80" style={{ background: hue }} />
            <svg viewBox="0 0 76 76" className="h-[76px] w-[76px] shrink-0 -rotate-90" aria-hidden>
              <circle cx="38" cy="38" r={R} fill="none" stroke="color-mix(in srgb, var(--fg) 10%, transparent)" strokeWidth="7" />
              <motion.circle
                cx="38"
                cy="38"
                r={R}
                fill="none"
                stroke={hue}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={C}
                initial={reduce ? false : { strokeDashoffset: C }}
                animate={{ strokeDashoffset: C * (1 - v / 100) }}
                transition={{ delay: 0.2 + i * 0.12, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <span className="min-w-0">
              <span className="label block text-[0.72rem] text-faint">{it.label}</span>
              <span className="num mt-1 block text-[2rem] leading-none text-fg-strong">{v}%</span>
              <span className="mt-1.5 block text-[0.85rem] leading-snug text-muted">{it.caption}</span>
            </span>
          </div>
        );
        return it.href ? (
          <a key={it.label} href={it.href} className="block">
            {body}
          </a>
        ) : (
          <div key={it.label}>{body}</div>
        );
      })}
    </div>
  );
}

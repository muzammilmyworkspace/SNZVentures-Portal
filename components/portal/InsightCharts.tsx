"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { useReduced } from "./useReduced";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

/**
 * THE STUDENT DASHBOARD CHARTS (admin home, Oct 2026).
 *
 * Same rules as DashboardCharts.tsx (the dataviz skill):
 *   - colours from the validated tokens --viz-1..3, in fixed order; "not
 *     chosen yet" is neutral grey, never a fourth hue
 *   - one series per chart where possible, so no legend is needed; the donut
 *     has two hues and a grey, with a legend that also carries every value
 *   - text in text tokens, marks carry identity
 *   - every chart has a hover layer and a visually hidden table
 * Marks draw in on mount; under reduced motion they render complete.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/* --------------------------------------------------------------- Sparkline */

export function Sparkline({
  values,
  days,
  color = "var(--viz-1)",
  label,
}: {
  values: number[];
  days: string[];
  color?: string;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const reduce = useReduced();
  const box = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 200;
  const H = 48;
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length <= 1 ? W / 2 : (i / (values.length - 1)) * W);
  const y = (v: number) => H - 4 - (v / max) * (H - 10);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = values.length > 1 ? `${d} L${W} ${H} L0 ${H} Z` : "";

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || values.length === 0) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (values.length - 1));
    setHover(Math.max(0, Math.min(values.length - 1, i)));
  };

  return (
    <div className="relative">
      <svg
        ref={box}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-12 w-full overflow-visible"
        role="img"
        aria-label={`${label}, last ${values.length} days: ${values.reduce((a, b) => a + b, 0)} in total.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && (
          <motion.path
            d={area}
            fill={`url(#sp-${id})`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          />
        )}
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--fg-faint)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <span
          className="pv4-tip pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <span className="text-faint">{fmtDay(days[hover])}</span>
          <span className="num ml-2 text-fg-strong">{values[hover]}</span>
        </span>
      )}
      <table className="sr-only">
        <caption>{label} per day</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={days[i]}>
              <th scope="row">{days[i]}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------- KpiCard */

export function KpiCard({
  label,
  value,
  note,
  series,
  days,
  color,
  href,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  series: number[];
  days: string[];
  color: string;
  href?: string;
  icon: "users" | "check" | "clock" | "send";
}) {
  const week = series.slice(-7).reduce((a, b) => a + b, 0);
  const body = (
    <>
      <span className="flex items-center gap-3">
        <span className="pv4-kpi-icon" style={{ "--kpi": color } as React.CSSProperties}>
          <KpiIcon name={icon} />
        </span>
        <span className="text-[0.85rem] font-medium text-muted">{label}</span>
      </span>
      <span className="mt-4 flex items-end justify-between gap-3">
        <span className="num text-[2.2rem] leading-none text-fg-strong">{value}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[0.74rem] font-semibold",
            week === 0 ? "bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] text-muted" : "text-fg-strong"
          )}
          style={week === 0 ? undefined : { background: `color-mix(in srgb, ${color} 18%, transparent)` }}
        >
          +{week} in 7 days
        </span>
      </span>
      <span className="mt-1 block text-[0.78rem] text-faint">{note}</span>
      <span className="mt-3 block">
        <Sparkline values={series} days={days} color={color} label={label} />
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="pv4-card pv4-lift group block p-5">
      {body}
    </Link>
  ) : (
    <div className="pv4-card block p-5">{body}</div>
  );
}

function KpiIcon({ name }: { name: "users" | "check" | "clock" | "send" }) {
  const p: Record<string, string> = {
    users: "M6 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 3.2a2.5 2.5 0 010 4.6M12.5 10.2c1.3.5 2 1.8 2 3.8",
    check: "M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM5 8.2l2 2 4-4.4",
    clock: "M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM8 4.5V8l2.5 1.5",
    send: "M14.5 1.5L7 9M14.5 1.5l-4.5 13-3-5.5-5.5-3 13-4.5z",
  };
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-4 w-4">
      <path d={p[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Funnel */

/**
 * How far the students have come. Each row counts everybody who has reached
 * that step or gone past it, so the bars only ever get shorter; the share is
 * of everybody who registered. One series, one hue, values on every bar.
 */
export function Funnel({ steps }: { steps: { label: string; value: number; href?: string }[] }) {
  const reduce = useReduced();
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <figure className="m-0">
      <ol className="space-y-3.5">
        {steps.map((s, i) => {
          const pct = Math.round((s.value / top) * 100);
          const prev = i > 0 ? steps[i - 1].value : null;
          const kept = prev ? Math.round((s.value / prev) * 100) : null;
          const row = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[0.88rem] font-medium text-fg">
                  <span className="pv4-step-dot">{i + 1}</span>
                  {s.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="num text-[1.05rem] text-fg-strong">{s.value}</span>
                  <span className="w-10 text-right text-[0.76rem] text-faint">{pct}%</span>
                </span>
              </span>
              <span className="mt-2 block h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]">
                <motion.span
                  className="block h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, color-mix(in srgb, var(--viz-1) 70%, transparent), var(--viz-1))",
                    transformOrigin: "left",
                    width: `${Math.max(pct, s.value > 0 ? 2 : 0)}%`,
                  }}
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.9, ease: EASE }}
                />
              </span>
              {kept !== null && prev! > 0 && (
                <span className="mt-1 block text-[0.72rem] text-faint">{kept}% of the step before</span>
              )}
            </>
          );
          return (
            <li key={s.label} title={`${s.label}: ${s.value} (${pct}% of registered)`}>
              {s.href ? (
                <Link href={s.href} className="pv4-row-link block rounded-lg">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ol>
      <table className="sr-only">
        <caption>Students by how far they have come</caption>
        <tbody>
          {steps.map((s) => (
            <tr key={s.label}>
              <th scope="row">{s.label}</th>
              <td>{s.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* ------------------------------------------------------------------- Donut */

export function Donut({
  parts,
  centerLabel,
}: {
  parts: { label: string; value: number; color: string }[];
  centerLabel: string;
}) {
  const reduce = useReduced();
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((a, p) => a + p.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const gap = total > 0 && parts.filter((p) => p.value > 0).length > 1 ? 3 : 0;
  let acc = 0;
  const arcs = parts.map((p) => {
    const len = total ? (p.value / total) * C : 0;
    const a = { ...p, len: Math.max(0, len - gap), off: acc };
    acc += len;
    return a;
  });
  const shown = hover !== null ? parts[hover] : null;

  return (
    <figure className="m-0 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-[156px] w-[156px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label={`${centerLabel}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="color-mix(in srgb, var(--fg) 7%, transparent)" strokeWidth="16" />
          {arcs.map((a, i) =>
            a.len > 0 ? (
              <motion.circle
                key={a.label}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === i ? 20 : 16}
                strokeLinecap="butt"
                strokeDasharray={`${a.len} ${C}`}
                strokeDashoffset={-a.off}
                style={{ transition: "stroke-width 0.2s" }}
                initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
                animate={{ strokeDasharray: `${a.len} ${C}` }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.9, ease: EASE }}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ) : null
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <span className="num block text-[1.7rem] leading-none text-fg-strong">{shown ? shown.value : total}</span>
            <span className="mt-1 block max-w-[90px] text-[0.72rem] leading-tight text-faint">{shown ? shown.label : centerLabel}</span>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {parts.map((p, i) => (
          <li
            key={p.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors", hover === i && "bg-[var(--pv-hover)]")}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="flex-1 text-[0.86rem] text-fg">{p.label}</span>
            <span className="num text-[0.95rem] text-fg-strong">{p.value}</span>
            <span className="w-10 text-right text-[0.76rem] text-faint">{total ? Math.round((p.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* -------------------------------------------------------------- AgentBoard */

export function AgentBoard({
  agents,
}: {
  agents: { id: string; name: string; code: string | null; students: number; verified: number }[];
}) {
  const reduce = useReduced();
  const max = Math.max(1, ...agents.map((a) => a.students));
  if (agents.length === 0) {
    return (
      <p className="py-6 text-center text-[0.86rem] text-faint">
        No sales agent has brought a student yet. Their students appear here as they register.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {agents.map((a, i) => (
        <li key={a.id} className="flex items-center gap-3" title={`${a.name}: ${a.students} students, ${a.verified} fee verified`}>
          <span className={cn("pv4-rank", i === 0 && "is-first")}>{i + 1}</span>
          <Avatar id={a.id} name={a.name} photo={false} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.86rem] font-medium text-fg">
                {a.name}
                {a.code && <span className="ml-1.5 text-[0.72rem] text-faint">{a.code}</span>}
              </span>
              <span className="shrink-0 text-[0.76rem] text-faint">
                <span className="num text-[0.9rem] text-fg-strong">{a.students}</span> students · {a.verified} verified
              </span>
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]">
              <motion.span
                className="block h-full rounded-full bg-[var(--viz-3)]"
                style={{ width: `${(a.students / max) * 100}%`, transformOrigin: "left" }}
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.8, ease: EASE }}
              />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

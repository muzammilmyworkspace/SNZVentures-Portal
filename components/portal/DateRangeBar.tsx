import Link from "next/link";
import { RANGE_PRESETS, type ResolvedRange } from "@/lib/portal/date-range";
import { cn } from "@/lib/utils";

/**
 * THE PERIOD PICKER, like an ads manager's.
 *
 * Links, not state: the period is in the URL, so a view of "last month" can be
 * bookmarked, shared, and survives a reload. Custom dates are a plain GET form,
 * which works before any JavaScript has loaded.
 *
 * Not inside a Panel: the panel clips its overflow, and the custom popover
 * has to hang below the bar.
 */
export function DateRangeBar({ range, basePath }: { range: ResolvedRange; basePath: string }) {
  const href = (key: string) => (key === "30d" ? basePath : `${basePath}?range=${key}`);

  return (
    <div className="portal-rise relative z-20 mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[18px] border border-line bg-[image:var(--panel-bg)] px-4 py-3 shadow-[var(--panel-shadow)]">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-accent"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-4 w-4">
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
            <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold text-fg-strong">
            {range.label}
            <span className="ml-2 font-normal text-muted">{range.text}</span>
          </p>
          <p className="text-[0.78rem] text-faint">Compared with {range.prevText}</p>
        </div>
      </div>

      <nav aria-label="Reporting period" className="flex flex-wrap items-center gap-1.5">
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p.key}
            href={href(p.key)}
            scroll={false}
            aria-current={range.key === p.key ? "true" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3.5 text-[0.8rem] font-medium transition-colors",
              range.key === p.key
                ? "bg-[var(--accent)] text-[#070B1A]"
                : "border border-line text-muted hover:border-moss-400/60 hover:text-fg"
            )}
          >
            {p.label}
          </Link>
        ))}

        <details className="group relative">
          <summary
            className={cn(
              "inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-medium transition-colors [&::-webkit-details-marker]:hidden",
              range.key === "custom"
                ? "bg-[var(--accent)] text-[#070B1A]"
                : "border border-line text-muted hover:border-moss-400/60 hover:text-fg"
            )}
          >
            Custom
            <svg viewBox="0 0 10 6" aria-hidden className="h-1.5 w-2.5 transition-transform group-open:rotate-180">
              <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <form
            action={basePath}
            method="get"
            className="absolute right-0 top-[calc(100%+8px)] z-30 w-[17rem] rounded-[14px] border border-line-strong bg-[var(--panel-solid)] p-4 shadow-xl"
          >
            <input type="hidden" name="range" value="custom" />
            <label className="block">
              <span className="label text-[0.7rem] text-faint">From</span>
              <input type="date" name="from" required defaultValue={range.fromInput} className="field mt-1 w-full py-1.5 text-[0.85rem]" />
            </label>
            <label className="mt-3 block">
              <span className="label text-[0.7rem] text-faint">To</span>
              <input type="date" name="to" required defaultValue={range.toInput} className="field mt-1 w-full py-1.5 text-[0.85rem]" />
            </label>
            <button
              type="submit"
              className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-full bg-[var(--accent)] text-[0.85rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90"
            >
              Apply
            </button>
          </form>
        </details>
      </nav>
    </div>
  );
}

/**
 * One figure for the period, with the change against the period before.
 * The direction is said in words and an arrow as well as colour.
 */
export function PeriodStat({
  label,
  cur,
  prev,
  href,
  hue,
}: {
  label: string;
  cur: number;
  prev: number;
  href?: string;
  hue: string;
}) {
  let delta: { text: string; tone: "up" | "down" | "flat" };
  if (cur === prev) delta = { text: "No change", tone: "flat" };
  else if (prev === 0) delta = { text: `+${cur} new`, tone: "up" };
  else {
    const pct = Math.round(((cur - prev) / prev) * 100);
    delta = { text: `${Math.abs(pct)}%`, tone: pct >= 0 ? "up" : "down" };
  }

  const body = (
    <>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: hue }} />
      <span className="label text-[0.7rem] text-faint">{label}</span>
      <span className="num mt-3 block text-[2.1rem] leading-none text-fg-strong">{cur}</span>
      <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem]">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
            delta.tone === "up" && "bg-moss-400/15 text-accent",
            delta.tone === "down" && "bg-[var(--danger-soft)] text-danger",
            delta.tone === "flat" && "bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] text-muted"
          )}
        >
          {delta.tone !== "flat" && (
            <svg viewBox="0 0 10 10" aria-hidden className={cn("h-2.5 w-2.5", delta.tone === "down" && "rotate-180")}>
              <path d="M5 1.5L9 7.5H1z" fill="currentColor" />
            </svg>
          )}
          <span className="sr-only">{delta.tone === "up" ? "Up" : delta.tone === "down" ? "Down" : ""}</span>
          {delta.text}
        </span>
        <span className="text-faint">vs {prev} before</span>
      </span>
    </>
  );

  const cls =
    "group portal-rise relative block overflow-hidden rounded-[16px] border border-line bg-[image:var(--panel-bg)] p-4 shadow-[var(--panel-shadow)] transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-moss-400/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

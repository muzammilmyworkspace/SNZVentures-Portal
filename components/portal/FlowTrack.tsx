import Link from "next/link";
import { STUDENT_FLOW, stateOf, type FlowState } from "@/lib/portal/journey-flow";
import { cn } from "@/lib/utils";

/**
 * THE STUDENT ROUTE, DRAWN ONCE.
 * ---------------------------------------------------------------------------
 * The dashboard and My Journey both answer "where am I". They were two
 * separate renderings of two different sources, and they disagreed: the
 * journey page was rebuilt around the real stage while the dashboard still
 * drew the old seven-stage list with nothing marked on it. A student could
 * open the two in adjacent tabs and be told two different things.
 *
 * One component, one source. `compact` is a size, not a second version.
 */

const TONE: Record<FlowState, { dot: string; card: string; label: string }> = {
  done: { dot: "border-moss-400 bg-moss-400 text-navy-950", card: "border-line", label: "Done" },
  current: {
    dot: "border-moss-400 text-accent",
    card: "border-moss-400/50 bg-moss-400/[0.06]",
    label: "Your move",
  },
  waiting: {
    dot: "border-amber-300/70 text-amber-300",
    card: "border-amber-300/40 bg-amber-300/[0.06]",
    label: "With us",
  },
  upcoming: { dot: "border-line text-faint", card: "border-line opacity-70", label: "Later" },
};

export function FlowTrack({
  current,
  waiting,
  compact = false,
  completion = null,
}: {
  current: number;
  waiting: boolean;
  compact?: boolean;
  /** The application's own progress, shown on the stage it belongs to. */
  completion?: { percent: number; answered: number; total: number } | null;
}) {
  return (
    <ol className={cn(compact ? "space-y-2" : "space-y-3")}>
      {STUDENT_FLOW.map((stage, i) => {
        const state = stateOf(i, current, waiting);
        const tone = TONE[state];
        const showAction = state === "current" && stage.action;

        return (
          <li
            key={stage.key}
            className={cn(
              "flex gap-3 rounded-[var(--radius-md)] border transition-colors",
              compact ? "p-3" : "gap-4 p-4 sm:p-5",
              tone.card
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex shrink-0 items-center justify-center rounded-full border font-mono",
                compact ? "h-6 w-6 text-[0.62rem]" : "h-7 w-7 text-[0.7rem]",
                tone.dot
              )}
            >
              {state === "done" ? "✓" : String(i + 1).padStart(2, "0")}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3
                  className={cn(
                    "font-semibold text-fg",
                    compact ? "text-[0.88rem]" : "text-[0.98rem]"
                  )}
                >
                  {stage.name}
                </h3>
                <span className="label shrink-0 text-[0.6rem] text-faint">
                  {state === "upcoming" && stage.advisorLed ? "We handle this" : tone.label}
                </span>
              </div>

              {/* The reasoning behind each stage is worth the room on its own
                  page, and is noise beside eight other panels. */}
              {!compact && (
                <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">
                  {stage.description}
                </p>
              )}

              {stage.key === "application" && completion && state !== "upcoming" && (
                <div className={cn(compact ? "mt-2" : "mt-3")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.78rem] text-muted">
                      {completion.answered} of {completion.total} required answers
                    </span>
                    <span className="font-mono text-[0.72rem] text-accent">
                      {completion.percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-moss-400 transition-[width] duration-500"
                      style={{ width: `${completion.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {showAction && (
                <Link
                  href={stage.action!.href}
                  className={cn(
                    "label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300",
                    compact ? "mt-2.5" : "mt-3"
                  )}
                >
                  {stage.action!.label}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

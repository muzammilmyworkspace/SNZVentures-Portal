import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * THE PORTAL DESIGN SYSTEM
 * ---------------------------------------------------------------------------
 * Every portal surface — client and staff — is built from these. The visual
 * language was reworked to match the role-preview design; EVERY EXPORT KEPT ITS
 * NAME AND SIGNATURE so the twenty-two pages that import from here inherited
 * the new look without a single page edit. A prop rename here would have meant
 * twenty-two chances to break a working page for a cosmetic change.
 *
 * COLOUR LIVES IN CSS, NOT IN CLASS LISTS. Status tones resolve through the
 * `.pill-*` classes in globals.css, which are defined per theme. They were
 * previously Tailwind utilities like `text-ok`, picked when the site was
 * dark by default — on the light theme that is now the default, a 300-weight
 * colour on near-white is barely readable, and an unreadable status badge is
 * worse than none because the reader assumes they understood it.
 */

/* ---------------------------------------------------------- PortalHeading */

export function PortalHeading({
  eyebrow,
  title,
  lead,
  action,
  meta,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="pv4-head portal-rise mb-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="pv4-eyebrow mb-2.5">{eyebrow}</p>}
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.03em] text-fg-strong sm:text-[1.95rem]">{title}</h1>
          {lead && <p className="mt-2 max-w-2xl text-[0.92rem] leading-relaxed text-muted">{lead}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {meta && <div className="mt-5">{meta}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ Panel */

export function Panel({
  children,
  className,
  title,
  action,
  accent = false,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  accent?: boolean;
  padded?: boolean;
}) {
  return (
    <section
      className={cn(
        "portal-rise relative overflow-hidden rounded-[14px] border bg-[var(--panel-solid)] shadow-[var(--panel-shadow)]",
        accent ? "border-[color-mix(in_srgb,var(--accent)_40%,transparent)]" : "border-line",
        className
      )}
    >
      {(title || action) && (
        <header className="flex min-h-[52px] items-center justify-between gap-4 border-b border-line px-5 py-3">
          {title && <h2 className="text-[0.92rem] font-semibold text-fg-strong">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-my-3 inline-flex min-h-11 items-center gap-1 py-3 text-[0.82rem] font-semibold text-accent-ink transition-opacity hover:opacity-80"
    >
      {children}
      <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3 w-3">
        <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon = "file",
  title,
  body,
  action,
  note,
}: {
  icon?: "file" | "message" | "calendar" | "bell" | "check" | "search";
  title: string;
  body: string;
  action?: { label: string; href: string };
  note?: string;
}) {
  const paths: Record<string, string> = {
    file: "M6 3h6l4 4v11H6zM12 3v4h4",
    message: "M3 4h16v11h-9l-4 4v-4H3z",
    calendar: "M4 5h14v13H4zM4 9h14M8 3v3M14 3v3",
    bell: "M11 3a5 5 0 00-5 5c0 4-2 5.5-2 5.5h14S16 12 16 8a5 5 0 00-5-5zM9 17a2 2 0 004 0",
    check: "M4 11l4 4 9-9",
    search: "M9.5 15a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM13.5 13.5L18 18",
  };

  return (
    <div className="flex items-start gap-4 rounded-[14px] border border-dashed border-line-strong p-5">
      <span
        aria-hidden
        className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-accent"
      >
        <svg viewBox="0 0 22 22" fill="none" className="h-[18px] w-[18px]">
          <path
            d={paths[icon]}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[0.95rem] font-semibold text-fg">{title}</p>
        <p className="mt-1.5 max-w-md text-[0.9rem] leading-relaxed text-muted">{body}</p>
        {action && (
          <Link
            href={action.href}
            className="mt-4 inline-flex min-h-10 items-center rounded-[10px] border border-line-strong px-4 text-[0.88rem] font-semibold text-fg transition-colors hover:border-[var(--accent)] hover:text-accent"
          >
            {action.label}
          </Link>
        )}
        {note && <p className="mt-3 text-[0.8rem] leading-relaxed text-faint">{note}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Status */

/**
 * Status → semantic tone.
 *
 * Covers every value in the case, document, application, task and appointment
 * enums from lib/db/migrations, plus the intake statuses from 003. Anything
 * unmapped falls back to neutral rather than rendering unstyled.
 */
const STATUS_TONE: Record<string, string> = {
  // settled / good
  approved: "pill-ok",
  completed: "pill-ok",
  confirmed: "pill-ok",
  accepted: "pill-ok",
  active: "pill-ok",
  done: "pill-ok",
  // in flight
  in_progress: "pill-work",
  under_review: "pill-work",
  pending_review: "pill-work",
  assessment: "pill-work",
  // received, not started
  new: "pill-info",
  submitted: "pill-info",
  uploaded: "pill-info",
  scheduled: "pill-info",
  open: "pill-info",
  // waiting on the client
  action_required: "pill-warn",
  awaiting_client: "pill-warn",
  awaiting_response: "pill-warn",
  documents_required: "pill-warn",
  needs_update: "pill-warn",
  required: "pill-warn",
  returned: "pill-warn",
  pending: "pill-warn",
  // stopped
  rejected: "pill-danger",
  withdrawn: "pill-danger",
  suspended: "pill-danger",
  // inert
  draft: "pill-neutral",
  requested: "pill-neutral",
  cancelled: "pill-neutral",
  closed: "pill-neutral",
};

export function StatusPill({ status, label }: { status: string; label: string }) {
  return <span className={cn("pill", STATUS_TONE[status] ?? "pill-neutral")}>{label}</span>;
}

/* ---------------------------------------------------------------- StatCard */

/** A single figure, given room. Optionally a link to whatever it counts. */
export function StatCard({
  label,
  value,
  href,
  urgent = false,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  urgent?: boolean;
  hint?: string;
}) {
  const inner = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="text-[0.82rem] font-medium text-muted">{label}</span>
        {href && (
          <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-accent">
            <path d="M3 9l6-6M4 3h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={cn("num mt-3 block text-[1.9rem] leading-none", urgent ? "text-accent" : "text-fg-strong")}>{value}</span>
      {hint && <span className="mt-2 block text-[0.8rem] leading-relaxed text-faint">{hint}</span>}
    </>
  );

  const base = cn(
    "pv4-stat group relative block overflow-hidden rounded-[14px] border bg-[var(--panel-solid)] p-4 shadow-[var(--panel-shadow)] transition-colors sm:p-5",
    urgent ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]" : "border-line"
  );

  return href ? (
    <Link href={href} className={cn(base, "hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/* ---------------------------------------------------------------- WorkCard */

/**
 * A number that means WORK, with the words that make it mean something.
 *
 * The dashboards used to open with a row of bare figures — "Professionals 1",
 * "Docs to review 0", "Unread 1" — eight of them, all the same size, five of
 * them zero. Nothing told you which were jobs waiting for you and which were
 * just facts about the business, so the honest way to read it was to read all
 * eight and work it out. That is not a dashboard, it is a report.
 *
 * So each card here carries one line saying what the number MEANS and what
 * acting on it does. `note` is not decoration; a figure nobody can interpret
 * is worse than no figure, because it still costs attention.
 *
 * ZERO IS DELIBERATELY QUIET. A count above zero is work and gets the accent
 * colour, a ring and an arrow; a zero is drawn back in muted text. Making
 * "nothing to do" look identical to "four things to do" is how a screen full
 * of zeros teaches people to stop reading it.
 */
export function WorkCard({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number;
  note: string;
  href: string;
}) {
  const waiting = value > 0;
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full flex-col rounded-[14px] border bg-[var(--panel-solid)] p-4 shadow-[var(--panel-shadow)] transition-colors sm:p-5",
        waiting
          ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:border-[var(--accent)]"
          : "border-line hover:border-line-strong"
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className={cn("text-[0.88rem] font-semibold leading-snug", waiting ? "text-fg-strong" : "text-muted")}>{label}</span>
        <svg viewBox="0 0 12 12" fill="none" aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors", waiting ? "text-accent" : "text-faint group-hover:text-fg")}>
          <path d="M3 9l6-6M4 3h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="mt-3 flex items-center gap-2.5">
        <span className={cn("num block text-[2rem] leading-none", waiting ? "text-fg-strong" : "text-faint")}>{value}</span>
        {waiting && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 text-[0.72rem] font-semibold text-accent-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Needs action
          </span>
        )}
      </span>
      <span className="mt-auto block pt-3 text-[0.8rem] leading-relaxed text-faint">{note}</span>
    </Link>
  );
}

/**
 * What the top of the page says when none of the work cards has anything in
 * it. Four zeros in a row read as a broken screen; one sentence reads as good
 * news, which is what it is.
 */
export function AllClear({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
        >
          <svg viewBox="0 0 14 14" fill="none" className="h-3.5 w-3.5 text-accent-ink">
            <path
              d="M2.5 7.5L5.5 10.5L11.5 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold text-fg-strong">{title}</p>
          <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">{body}</p>
        </div>
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex min-h-10 shrink-0 items-center rounded-[10px] border border-line-strong px-4 text-[0.88rem] font-semibold text-fg transition-colors hover:border-[var(--accent)] hover:text-accent"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Breakdown */

/**
 * How a total divides up — one labelled row per part, each with its own bar.
 *
 * NOT A STACKED BAR AND NOT A PIE. Both of those need a legend, and a legend
 * means reading a colour, finding it in a key, and carrying the answer back —
 * three steps to learn one number. Rows carry their own label, so there is
 * nothing to decode.
 *
 * The bars are proportional to the LARGEST part, not to the total, because
 * with a lopsided split every bar against the total collapses into a stub and
 * the comparison the chart exists to make becomes invisible. The numbers
 * beside them are exact either way.
 */
export function Breakdown({
  parts,
  total,
  totalLabel,
}: {
  parts: { label: string; value: number }[];
  total: number;
  totalLabel: string;
}) {
  const largest = Math.max(1, ...parts.map((p) => p.value));

  return (
    <div>
      <div className="flex items-baseline gap-2.5 border-b border-line pb-4">
        <span className="num text-[2rem] leading-none tracking-[-0.03em] text-fg-strong">
          {total}
        </span>
        <span className="text-[0.85rem] text-muted">{totalLabel}</span>
      </div>

      <ul className="mt-5 space-y-3.5">
        {parts.map((p) => (
          <li key={p.label} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3">
            <span className="truncate text-[0.85rem] text-muted">{p.label}</span>
            {/*
              `block` on the track is load-bearing, not tidiness. A <span> is
              inline by default, so `h-1.5` had nothing to apply to and the
              fill's `h-full` resolved against a zero-height parent: every bar
              rendered as an empty grey track, identical whatever the number
              was. The chart looked broken in exactly the way that suggests no
              data, on a page whose whole job is showing real counts.
            */}
            <span
              aria-hidden
              className="block h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]"
            >
              {/*
                The moss ramp, not `bg-accent` — there is no such utility here.
                `--accent` is a CSS variable and only `.text-accent` is written
                by hand (see globals.css); `bg-accent` silently matched nothing,
                so the fill had width and no colour and every bar came out an
                empty grey track. Same gradient as ProgressBar, so the two read
                as the same kind of measure.
              */}
              <span
                className="block h-full rounded-full bg-gradient-to-r from-moss-600 via-moss-400 to-moss-300 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.round((p.value / largest) * 100)}%` }}
              />
            </span>
            <span className="num text-right text-[0.95rem] text-fg-strong">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- NextAction */

/**
 * The one thing to do next, given its own card at the top of the page.
 * A dashboard that answers "what now?" at a glance is the product.
 */
export function NextAction({
  title,
  body,
  cta,
  href,
  eyebrow = "Your next step",
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
  eyebrow?: string;
}) {
  return (
    <section className="portal-rise relative overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--panel-solid)] shadow-[var(--panel-shadow)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_18%,transparent),transparent)]"
      />
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent">
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[0.8rem] font-semibold text-accent-ink">{eyebrow}</p>
            <h2 className="mt-1 text-[1.3rem] font-semibold leading-tight tracking-[-0.02em] text-fg-strong sm:text-[1.5rem]">{title}</h2>
            <p className="mt-2 max-w-xl text-[0.92rem] leading-relaxed text-muted">{body}</p>
          </div>
        </div>
        <Link
          href={href}
          className="group inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-moss-400 px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300"
        >
          {cta}
          <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3 w-3 transition-transform group-hover:translate-x-0.5">
            <path d="M1 6h9M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Progress */

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div>
      {label && (
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="label text-faint">{label}</span>
          <span className="num text-[0.9rem] font-bold text-fg">{v}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-moss-600 via-moss-400 to-moss-300 transition-[width] duration-[900ms] ease-[var(--ease-out-expo)] motion-reduce:transition-none"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

/** Circular progress — used where a figure deserves more weight than a bar. */
export function ProgressRing({
  value,
  size = 96,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const v = Math.min(100, Math.max(0, value));
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="color-mix(in srgb, var(--fg) 11%, transparent)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-moss-400)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * v) / 100}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="num text-[1.35rem] font-bold leading-none text-fg-strong">{v}%</span>
        </span>
      </div>
      {label && <p className="text-[0.9rem] leading-relaxed text-muted">{label}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- JourneyTrack */

/**
 * The stage sequence, as a rail rather than a bar.
 *
 * A bar says how far along you are; this says what each step WAS and what comes
 * next, which is the question people actually have. `current` is the index of
 * the active stage; -1 means an advisor has not set one yet, which stays the
 * honest default rather than implying progress nobody recorded.
 *
 * Horizontal on wide screens, vertical on a phone. A seven-step horizontal rail
 * at 375px is unreadable, so it changes shape rather than shrinking.
 */
/**
 * The stages of a case, as a track.
 *
 * `compact` DROPS THE PER-STAGE DESCRIPTIONS. Laid out horizontally, seven
 * stages divide the panel into columns about 110px wide — wide enough for a
 * name, nowhere near enough for a sentence. The descriptions wrapped into
 * narrow ragged stacks that were technically present and practically unread,
 * and the whole card looked cramped because of it.
 *
 * The dashboard therefore shows the shape of the journey and where you are on
 * it; the full text lives on the journey page, which has one column per stage
 * and room to say it properly. Same data, told at the size each screen has.
 */
export function JourneyTrack({
  stages,
  current = -1,
  compact = false,
}: {
  stages: readonly { key: string; name: string; description: string }[];
  current?: number;
  compact?: boolean;
}) {
  return (
    <ol className="flex flex-col lg:flex-row">
      {stages.map((stage, i) => {
        const done = current > -1 && i < current;
        const active = i === current;
        const last = i === stages.length - 1;

        return (
          <li
            key={stage.key}
            className="relative flex flex-1 gap-4 pb-6 last:pb-0 lg:flex-col lg:gap-0 lg:pb-0"
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[7px] top-5 h-full w-px lg:left-auto lg:top-[7px] lg:h-px lg:w-full",
                  done ? "bg-moss-400/60" : "bg-[color-mix(in_srgb,var(--fg)_13%,transparent)]"
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 lg:mt-0",
                done && "border-moss-400 bg-moss-400",
                active && "border-moss-400 bg-surface",
                !done && !active && "border-[color-mix(in_srgb,var(--fg)_20%,transparent)] bg-surface"
              )}
            >
              {done && (
                <svg viewBox="0 0 10 10" className="h-2 w-2 text-navy-950">
                  <path d="M1 5l2.5 2.5L9 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {active && <span className="h-1.5 w-1.5 rounded-full bg-moss-400" />}
            </span>
            <span className="min-w-0 lg:mt-3 lg:pr-4">
              <span
                className={cn(
                  "block text-[0.95rem] font-medium",
                  active ? "text-accent" : done ? "text-fg" : "text-faint"
                )}
              >
                {stage.name}
              </span>
              {!compact && (
                <span className="mt-1 block text-[0.8rem] leading-snug text-muted">
                  {stage.description}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------- SummaryStat */

export function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="border-l border-line pl-4 first:border-l-0 first:pl-0">
      <p className="label text-faint">{label}</p>
      <p className="num mt-1.5 text-[1.75rem] font-bold leading-none text-fg-strong">{value}</p>
      {hint && <p className="mt-1 text-[0.75rem] text-faint">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ DataRow */

export function DataRow({
  label,
  value,
  meta,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="-mx-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[8px] border-b border-line px-2 py-3.5 transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
      <span className="min-w-0 text-[0.95rem] text-fg">{label}</span>
      <span className="flex shrink-0 items-center gap-3">
        {meta}
        {typeof value === "string" ? <span className="label text-faint">{value}</span> : value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- DataTable -- */

/** Scrolls inside its own container, so the PAGE never scrolls sideways. */
export function DataTable({
  columns,
  children,
  minWidth = 720,
  caption,
}: {
  columns: string[];
  children: ReactNode;
  minWidth?: number;
  caption?: string;
}) {
  return (
    <div className="rail overflow-x-auto">
      <table className="w-full text-left" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line bg-[var(--pv-panel-2,transparent)]">
            {columns.map((c, i) => (
              <th key={`${c}-${i}`} scope="col" className="whitespace-nowrap px-5 py-2.5 text-[0.76rem] font-semibold text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <tr className="group/row relative border-b border-line transition-colors last:border-0 hover:bg-[var(--pv-hover,color-mix(in_srgb,var(--fg)_4%,transparent))]">
      {children}
    </tr>
  );
}

export function Cell({
  children,
  muted = false,
  className,
}: {
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td className={cn("px-5 py-3.5 text-[0.9rem]", muted ? "text-muted" : "text-fg", className)}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------- Tabs -- */

/** Filters as links, so a filtered view is bookmarkable and survives reload. */
export function Tabs({
  items,
  active,
  label = "Filter",
}: {
  items: { key: string; label: string; href: string; count?: number }[];
  active: string;
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-[12px] border border-line bg-[var(--panel-solid)] p-1 shadow-[var(--panel-shadow)]"
    >
      {items.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "true" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-[0.86rem] font-medium transition-colors",
              on
                ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-fg-strong shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
                : "text-muted hover:bg-[var(--pv-hover,color-mix(in_srgb,var(--fg)_5%,transparent))] hover:text-fg"
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.72rem] font-semibold tabular-nums",
                  on ? "bg-[var(--accent)] text-[#070B1A]" : "bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] text-muted"
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------- ActivityTimeline - */

export function ActivityTimeline({
  items,
}: {
  items: { title: string; meta?: string; body?: string }[];
}) {
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-[var(--line-strong)]">
      {items.map((a, i) => (
        <li key={i} className="relative flex gap-3.5">
          <span aria-hidden className="relative z-[1] mt-[6px] h-[9px] w-[9px] shrink-0 rounded-full border-2 border-[var(--accent)] bg-[var(--panel-solid)]" />
          <span className="min-w-0">
            <span className="block text-[0.9rem] leading-relaxed text-fg">{a.title}</span>
            {a.body && (
              <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-muted">{a.body}</span>
            )}
            {a.meta && <span className="mt-0.5 block text-[0.75rem] text-faint">{a.meta}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------- DocumentCard -- */

export function DocumentCard({
  name,
  category,
  status,
  statusLabel,
  note,
  uploaded,
  owner,
  actions,
}: {
  name: string;
  category?: string;
  status: string;
  statusLabel?: string;
  note?: string;
  uploaded?: string;
  owner?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="group flex gap-4 border-b border-line py-4 last:border-0">
      <span
        aria-hidden
        className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
          <path d="M5 2.5h6.5L15 6v11.5H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold text-fg">{name}</p>
          {(owner || category || uploaded) && (
            <p className="mt-0.5 text-[0.8rem] text-faint">
              {[owner, category, uploaded].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <StatusPill status={status} label={statusLabel ?? status.replace(/_/g, " ")} />
      </div>
      {note && <p className="mt-2.5 max-w-2xl text-[0.85rem] leading-relaxed text-muted">{note}</p>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- BackendRequired - */

/**
 * Development-only build note.
 *
 * Hidden in production: a client signing in to their own workspace should never
 * be shown an engineering to-do list. The gap is still visible in every empty
 * state, phrased for them rather than for us.
 */
export function BackendRequired({
  feature,
  needs,
}: {
  feature: string;
  needs: string[];
}) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <aside
      data-dev-note
      className="rounded-[var(--radius-md)] border border-dashed border-line p-5"
    >
      <p className="label text-faint">Dev note — {feature}</p>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-muted">
        Hidden in production. Populates once these exist:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-4 text-[0.8rem] text-muted marker:text-faint">
        {needs.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </aside>
  );
}

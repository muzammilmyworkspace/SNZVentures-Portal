/**
 * THE DASHBOARD'S REPORTING PERIOD.
 *
 * Presets like an ads manager: last 7 / 15 / 30 / 90 days, this month, last
 * month, or a custom from–to. Every period is compared with the one before it
 * of the same length, so "this month" on the 4th is set against the first four
 * days of last month, not against all of it — otherwise every month would look
 * like a collapse until its last week.
 *
 * Plain module (no "use client"): the server page resolves the range and the
 * filter bar renders from the result.
 */

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days" },
  { key: "15d", label: "Last 15 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"] | "custom";

export type ResolvedRange = {
  key: RangeKey;
  label: string;
  /** Inclusive start, midnight UTC. */
  from: Date;
  /** Exclusive end, midnight UTC. */
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  days: number;
  bucket: "day" | "week";
  /** "1 Sep – 30 Sep 2026" */
  text: string;
  prevText: string;
  /** For the custom inputs: YYYY-MM-DD, inclusive. */
  fromInput: string;
  toInput: string;
};

const DAY = 86_400_000;
const MAX_DAYS = 366;

const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function parseDay(raw: unknown): Date | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtSpan(from: Date, toExclusive: Date): string {
  const last = addDays(toExclusive, -1);
  const sameYear = from.getUTCFullYear() === last.getUTCFullYear();
  const opts = { day: "numeric", month: "short", timeZone: "UTC" } as const;
  const a = from.toLocaleDateString("en-GB", sameYear ? opts : { ...opts, year: "numeric" });
  const b = last.toLocaleDateString("en-GB", { ...opts, year: "numeric" });
  return from.getTime() === last.getTime() ? b : `${a} – ${b}`;
}

export function resolveRange(
  sp: Record<string, string | string[] | undefined>,
  now = new Date()
): ResolvedRange {
  const today = utcMidnight(now);
  const tomorrow = addDays(today, 1);
  const raw = Array.isArray(sp.range) ? sp.range[0] : sp.range;

  let key: RangeKey = RANGE_PRESETS.some((p) => p.key === raw) ? (raw as RangeKey) : "30d";
  let from: Date;
  let to: Date;
  let prevFrom: Date;
  let prevTo: Date;

  const customFrom = parseDay(sp.from);
  const customTo = parseDay(sp.to);

  if (raw === "custom" && customFrom && customTo) {
    key = "custom";
    const [a, b] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    to = addDays(b, 1);
    from = a;
    if ((to.getTime() - from.getTime()) / DAY > MAX_DAYS) from = addDays(to, -MAX_DAYS);
    const len = to.getTime() - from.getTime();
    prevTo = from;
    prevFrom = new Date(from.getTime() - len);
  } else if (key === "this_month") {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    to = tomorrow;
    // Like for like: the same number of days at the start of last month.
    prevFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    prevTo = new Date(Math.min(prevFrom.getTime() + (to.getTime() - from.getTime()), from.getTime()));
  } else if (key === "last_month") {
    from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    prevFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
    prevTo = from;
  } else {
    const n = Number(key.replace("d", ""));
    to = tomorrow;
    from = addDays(to, -n);
    prevTo = from;
    prevFrom = addDays(from, -n);
  }

  const days = Math.round((to.getTime() - from.getTime()) / DAY);
  return {
    key,
    label: key === "custom" ? "Custom" : RANGE_PRESETS.find((p) => p.key === key)!.label,
    from,
    to,
    prevFrom,
    prevTo,
    days,
    bucket: days > 45 ? "week" : "day",
    text: fmtSpan(from, to),
    prevText: fmtSpan(prevFrom, prevTo),
    fromInput: iso(from),
    toInput: iso(addDays(to, -1)),
  };
}

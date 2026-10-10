/**
 * REPORT DATE RANGES, the way an ads manager offers them: a list of ready
 * ranges (today, last 7 days, last month, this year…) or any two dates.
 * Plain functions with no server imports, so the picker and the page agree.
 * Dates are YYYY-MM-DD, worked out in UTC.
 */

export const RANGE_PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7", "Last 7 days"],
  ["last14", "Last 14 days"],
  ["last30", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_quarter", "This quarter"],
  ["last_quarter", "Last quarter"],
  ["this_year", "This year"],
  ["last_year", "Last year"],
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number][0];
export type ResolvedRange = { preset: RangePreset | "custom"; from: string; to: string; label: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The dates of a ready range, counted from `today`. */
export function presetDates(p: RangePreset, today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const mo = m - 1;
  const q = Math.floor(mo / 3) * 3;
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const t = iso(utc(y, mo, d - 1));
      return { from: t, to: t };
    }
    case "last7":
      return { from: iso(utc(y, mo, d - 6)), to: today };
    case "last14":
      return { from: iso(utc(y, mo, d - 13)), to: today };
    case "last30":
      return { from: iso(utc(y, mo, d - 29)), to: today };
    case "this_month":
      return { from: iso(utc(y, mo, 1)), to: iso(utc(y, mo + 1, 0)) };
    case "last_month":
      return { from: iso(utc(y, mo - 1, 1)), to: iso(utc(y, mo, 0)) };
    case "this_quarter":
      return { from: iso(utc(y, q, 1)), to: iso(utc(y, q + 3, 0)) };
    case "last_quarter":
      return { from: iso(utc(y, q - 3, 1)), to: iso(utc(y, q, 0)) };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

export const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const rangeText = (from: string, to: string) => (from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`);

/**
 * The range a report shows, from its address: ?range=last30, or ?from=&to=,
 * or the older ?m=2026-10 (a month); this month when nothing is given.
 */
export function resolveRange(sp: { range?: string; from?: string; to?: string; m?: string }, today: string): ResolvedRange {
  if (sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to)) {
    const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { preset: "custom", from, to, label: "Custom" };
  }
  if (sp.m && /^\d{4}-\d{2}$/.test(sp.m)) {
    const [y, m] = sp.m.split("-").map(Number);
    return { preset: "custom", from: `${sp.m}-01`, to: iso(utc(y, m, 0)), label: "Month" };
  }
  const found = RANGE_PRESETS.find(([k]) => k === sp.range);
  const preset: RangePreset = found ? found[0] : "this_month";
  return { preset, ...presetDates(preset, today), label: RANGE_PRESETS.find(([k]) => k === preset)![1] };
}

/** The months (YYYY-MM) a range touches, oldest first. */
export function monthsIn(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The address part for a range, for links and downloads. */
export const rangeQuery = (r: ResolvedRange) => (r.preset === "custom" ? `from=${r.from}&to=${r.to}` : `range=${r.preset}`);

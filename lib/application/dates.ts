/**
 * DATES, CHECKED RATHER THAN TRUSTED.
 * ---------------------------------------------------------------------------
 * `<input type="date">` looks like it validates for you. It does not:
 *
 *   • Its year box has no cap of its own. A passport issue date of
 *     12/06/275760 was typed straight in and accepted, because Chrome's date
 *     control happily reaches the year 275760.
 *   • When what has been typed cannot be parsed, the control keeps SHOWING the
 *     digits and reports an empty string to script. The form then said "this
 *     one is required" beside a box with a date visibly in it — which reads as
 *     the form being broken, and is unarguable from the user's side.
 *   • `new Date("2026-02-30")` does not throw. It quietly returns 2 March.
 *
 * So every date goes through here, on the client for an immediate message and
 * on the server because that is where it is actually decided.
 */

export type DateProblem = string | null;

/**
 * A bound written in the definition, turned into a date.
 *
 * "today" and "+20y" rather than a fixed string, because a passport bound
 * baked in at build time is wrong the next morning. Resolved at the moment it
 * is checked, on both sides.
 */
export function resolveBound(bound: string | undefined): string | undefined {
  if (!bound) return undefined;
  if (bound === "today") return today();
  const relative = /^([+-])(\d+)y$/.exec(bound);
  if (relative) {
    const years = Number(relative[2]);
    return yearsFromNow(relative[1] === "-" ? -years : years);
  }
  return bound;
}

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Today, at UTC midnight, so comparisons do not drift with the clock. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date `years` from now — for bounds like "a passport expiring later". */
export function yearsFromNow(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Is this a real calendar date, written the way a date input writes them?
 *
 * The round-trip is the point: serialising the parsed date back and comparing
 * is the only way to catch a day that does not exist in that month, because
 * Date rolls it forward without complaint.
 */
export function isRealDate(value: string): boolean {
  if (!SHAPE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

const readable = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * What is wrong with this date, in words, or null if nothing is.
 *
 * `label` is the field's own label so the message can name it — "Expiry date
 * cannot be in the past" is actionable where "invalid date" is not.
 */
export function dateProblem(
  value: string,
  bounds: { min?: string; max?: string } = {},
  label = "That date"
): DateProblem {
  const v = value.trim();
  if (!v) return null; // emptiness is the required check's business, not ours

  if (!SHAPE.test(v)) return `${label} is not complete. Use the date picker or type dd/mm/yyyy.`;
  if (!isRealDate(v)) return `${label} is not a real date — please check the day and month.`;

  if (bounds.min && v < bounds.min) return `${label} cannot be before ${readable(bounds.min)}.`;
  if (bounds.max && v > bounds.max) return `${label} cannot be after ${readable(bounds.max)}.`;

  return null;
}

/**
 * FIELD RULES, RUN RATHER THAN READ.
 *
 * The date-of-birth check shipped accepting a five-digit year, because a shape
 * check on `<input type="date">` output looks like it is doing the job and is
 * not. That class of bug does not survive being executed, so it is executed.
 *
 *   npm run verify:fields
 */
import { passportError, dobError } from "../lib/portal/payment-consent.ts";
import { env, envOr, envSet } from "../lib/env.ts";
import { dateProblem, resolveBound, isRealDate, today } from "../lib/application/dates.ts";

let failures = 0;
function expect(label, actual, shouldPass) {
  const passed = actual === null;
  if (passed !== shouldPass) {
    failures++;
    console.log(
      `  FAIL  ${label} — expected ${shouldPass ? "accept" : "reject"}, got ${
        passed ? "accept" : `reject ("${actual}")`
      }`
    );
  }
}

const year = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};

console.log("\n=== passport numbers ===");
[
  ["JW557261", true],
  ["AB1234567", true],
  ["123456", true],
  ["A12345678901", true],
].forEach(([v, ok]) => expect(`accept ${v}`, passportError(v), ok));

[
  ["", false],
  ["AB12", false],                 // too short
  ["A1234567890123", false],       // too long
  ["AB 123456", false],            // space
  ["AB-123456", false],            // dash
  ["AB12345!", false],             // punctuation
  ["my passport is AB1234", false] // pasted sentence
].forEach(([v, ok]) => expect(`reject "${v}"`, passportError(v), ok));

console.log("\n=== dates of birth ===");
[
  [year(25), true],
  [year(18), true],
  [year(60), true],
].forEach(([v, ok]) => expect(`accept ${v}`, dobError(v), ok));

[
  ["", false],
  ["20255-01-01", false],   // five-digit year — the reported bug
  ["202555-01-01", false],  // six
  ["99999-12-31", false],
  ["2026-02-30", false],    // not a real day; Date rolls it to 2 March
  ["2026-13-01", false],    // not a real month
  ["01/01/2000", false],    // wrong shape
  [year(10), false],        // under 16
  [year(120), false],       // over 100
  [year(0), false],         // today
].forEach(([v, ok]) => expect(`reject "${v}"`, dobError(v), ok));

/* ── environment reads ──────────────────────────────────────────────────
   A dashboard happily saves a variable with nothing in it. `??` keeps that
   empty string, and the blank bucket name it produced turned every storage
   URL into a 404 that blamed the bucket. Executed, not assumed. */
console.log("\n=== environment reads ===");
const cases = [
  ["unset", undefined, undefined, "fallback", false],
  ["empty", "", undefined, "fallback", false],
  ["whitespace", "   ", undefined, "fallback", false],
  ["tab and newline", "\t\n", undefined, "fallback", false],
  ["a value", "bucket-name", "bucket-name", "bucket-name", true],
  ["padded value", "  bucket-name  ", "bucket-name", "bucket-name", true],
];
for (const [label, raw, wantEnv, wantOr, wantSet] of cases) {
  if (raw === undefined) delete process.env.__PROBE;
  else process.env.__PROBE = raw;

  const gotEnv = env("__PROBE");
  const gotOr = envOr("__PROBE", "fallback");
  const gotSet = envSet("__PROBE");

  if (gotEnv !== wantEnv || gotOr !== wantOr || gotSet !== wantSet) {
    failures++;
    console.log(
      `  FAIL  ${label}: env=${JSON.stringify(gotEnv)} envOr=${JSON.stringify(gotOr)} envSet=${gotSet}`
    );
  }
}
delete process.env.__PROBE;

/* ── application dates ──────────────────────────────────────────────────
   A passport issue date of 12/06/275760 was typed into the live form and
   accepted. <input type="date"> puts no cap on its own year box, and reports
   an empty string for anything it cannot parse while still showing the digits
   — so the form insisted a visibly filled field was empty. Executed here, on
   the same function the server uses. */
console.log("\n=== application dates ===");

const dateCase = (label, value, bounds, shouldPass) => {
  const problem = dateProblem(value, bounds, "That date");
  const passed = problem === null;
  if (passed !== shouldPass) {
    failures++;
    console.log(
      `  FAIL  ${label} — expected ${shouldPass ? "accept" : "reject"}, got ${
        passed ? "accept" : `reject ("${problem}")`
      }`
    );
  }
};

dateCase("empty is the required check's business", "", {}, true);
dateCase("an ordinary date", "1998-04-17", {}, true);
dateCase("the reported six-digit year", "275760-06-12", {}, false);
dateCase("a five-digit year", "20255-01-01", {}, false);
dateCase("a day that does not exist", "2026-02-30", {}, false);
dateCase("a month that does not exist", "2026-13-01", {}, false);
dateCase("the wrong shape entirely", "12/06/2026", {}, false);
dateCase("within bounds", "2020-01-01", { min: "2000-01-01", max: "2030-01-01" }, true);
dateCase("before the minimum", "1999-12-31", { min: "2000-01-01" }, false);
dateCase("after the maximum", "2030-01-02", { max: "2030-01-01" }, false);
dateCase("exactly the minimum", "2000-01-01", { min: "2000-01-01" }, true);
dateCase("exactly the maximum", "2030-01-01", { max: "2030-01-01" }, true);

if (!isRealDate("2024-02-29")) { failures++; console.log("  FAIL  a real leap day was rejected"); }
if (isRealDate("2023-02-29")) { failures++; console.log("  FAIL  a leap day in a non-leap year was accepted"); }

/* Relative bounds must move with the calendar — a passport rule baked in at
   build time is wrong the next morning. */
if (resolveBound("today") !== today()) { failures++; console.log("  FAIL  \"today\" did not resolve to today"); }
if (resolveBound("2020-05-05") !== "2020-05-05") { failures++; console.log("  FAIL  a literal bound was rewritten"); }
if (resolveBound(undefined) !== undefined) { failures++; console.log("  FAIL  an absent bound became a date"); }

const inTwenty = resolveBound("+20y");
const twentyBack = resolveBound("-20y");
const thisYear = Number(today().slice(0, 4));
if (Number(inTwenty.slice(0, 4)) !== thisYear + 20) { failures++; console.log(`  FAIL  +20y resolved to ${inTwenty}`); }
if (Number(twentyBack.slice(0, 4)) !== thisYear - 20) { failures++; console.log(`  FAIL  -20y resolved to ${twentyBack}`); }

/* And the bounds the application actually declares must reject the thing that
   started this: a passport issued, or expiring, in the year 275760. */
const { STUDY_APPLICATION } = await import("../lib/application/definition.ts");
for (const key of ["passportIssue", "passportExpiry", "dob", "eduEnd"]) {
  const f = STUDY_APPLICATION.steps.flatMap((s) => s.fields).find((x) => x.key === key)
    ?? STUDY_APPLICATION.steps
      .flatMap((s) => s.fields)
      .flatMap((x) => x.item ?? [])
      .find((x) => x.key === key);
  if (!f) { failures++; console.log(`  FAIL  ${key} is not in the definition`); continue; }
  if (!f.dateMax && !f.dateMin) { failures++; console.log(`  FAIL  ${key} declares no bounds`); continue; }
  const bounds = { min: resolveBound(f.dateMin), max: resolveBound(f.dateMax) };
  if (dateProblem("275760-06-12", bounds, f.label) === null) {
    failures++;
    console.log(`  FAIL  ${key} accepts the year 275760`);
  }
}

console.log(
  failures === 0
    ? "\n  Field rules verified — every case behaves.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

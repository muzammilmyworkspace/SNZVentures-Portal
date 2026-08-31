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

console.log(
  failures === 0
    ? "\n  Field rules verified — every case behaves.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

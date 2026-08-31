/**
 * THE GATE, CHECKED PATH BY PATH.
 *
 * This exists because the first version of `pathOpen` had "/portal" in the
 * always-open list and matched it as a PREFIX, so every route under /portal
 * was open at every stage and nothing was ever locked. The list read
 * correctly; only the matcher was wrong, which is exactly the kind of bug that
 * survives being read and dies on being run.
 *
 *   npm run verify:gate
 *
 * No database and no server — the rules are pure functions, so they can be
 * asserted directly.
 */
import { pathOpen } from "../lib/portal/stage-rules.ts";

const LOCKED_UNTIL_FEE = [
  "/portal/application",
  "/portal/journey",
  "/portal/cases",
  "/portal/documents",
  "/portal/tasks",
  "/portal/universities",
  "/portal/scholarships",
  "/portal/appointments",
  "/portal/profile",
];

const ALWAYS_REACHABLE = [
  "/portal",
  "/portal/student",
  "/portal/messages",
  "/portal/messages/abc-123", // a thread, not just the index
  "/portal/notifications",
  "/portal/settings",
  "/portal/support",
];

const BEFORE = ["fee_due", "fee_review", "fee_rejected"];
const AFTER = ["application", "consent_due", "complete"];

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label} — expected ${expected ? "open" : "LOCKED"}, got ${actual ? "open" : "LOCKED"}`);
  }
  return ok;
};

console.log("\n=== before the fee is verified: these must be LOCKED ===");
for (const stage of BEFORE) {
  let ok = 0;
  for (const p of LOCKED_UNTIL_FEE) if (check(`${stage} ${p}`, pathOpen(p, stage), false)) ok++;
  console.log(`  ${ok === LOCKED_UNTIL_FEE.length ? "ok  " : "FAIL"}  ${stage}: ${ok}/${LOCKED_UNTIL_FEE.length} locked`);
}

console.log("\n=== always reachable, at every stage ===");
for (const stage of [...BEFORE, ...AFTER]) {
  let ok = 0;
  for (const p of ALWAYS_REACHABLE) if (check(`${stage} ${p}`, pathOpen(p, stage), true)) ok++;
  console.log(`  ${ok === ALWAYS_REACHABLE.length ? "ok  " : "FAIL"}  ${stage}: ${ok}/${ALWAYS_REACHABLE.length} open`);
}

console.log("\n=== after the fee is verified: these must OPEN ===");
for (const stage of AFTER) {
  let ok = 0;
  for (const p of LOCKED_UNTIL_FEE) if (check(`${stage} ${p}`, pathOpen(p, stage), true)) ok++;
  console.log(`  ${ok === LOCKED_UNTIL_FEE.length ? "ok  " : "FAIL"}  ${stage}: ${ok}/${LOCKED_UNTIL_FEE.length} open`);
}

// A child route must inherit its parent's lock, or typing one extra segment
// walks straight past the gate.
console.log("\n=== child routes inherit the lock ===");
check("fee_due /portal/documents/xyz", pathOpen("/portal/documents/xyz", "fee_due"), false);
check("fee_due /portal/application/step-2", pathOpen("/portal/application/step-2", "fee_due"), false);
console.log(failures === 0 ? "  ok    children stay locked" : "  FAIL  a child route escaped the gate");

console.log(
  failures === 0
    ? "\n  Gate verified — every path behaves at every stage.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

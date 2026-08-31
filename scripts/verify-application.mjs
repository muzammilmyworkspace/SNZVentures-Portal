/**
 * THE STUDENT APPLICATION, CHECKED AS DATA.
 *
 *   npm run verify:application
 *
 * The form is a definition rather than a component, which means its faults are
 * data faults: a key that repeats and silently overwrites another answer, a
 * showWhen pointing at a field that no longer exists, a required question
 * hidden behind a condition that can never be true. None of those break the
 * build, and all of them are invisible until somebody is halfway through
 * filling it in.
 */
import { STUDY_APPLICATION } from "../lib/application/definition.ts";
import { fieldVisible, optionsFor, DECORATIVE } from "../lib/application/types.ts";
import { documentsFor, filenamePrefix } from "../lib/application/documents.ts";
import { buildMotivation } from "../lib/application/motivation.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const steps = STUDY_APPLICATION.steps;
const all = steps.flatMap((s) => s.fields);
const byKey = new Map();

console.log("\n=== structure ===");
if (steps.length !== 10) fail(`expected 10 sections, found ${steps.length}`);
else ok("ten sections");

/* The undertaking must be LAST. It authorises us to send the file, so it is
   signed on the finished thing — a signature taken before the final section
   is a signature on a document that was still being written. */
if (steps[steps.length - 1].key !== "undertaking") {
  fail("the consent & undertaking is not the final section");
} else {
  ok("the undertaking is the last section");
}
if (!steps.some((s) => s.fields.some((f) => f.type === "consent"))) {
  fail("no section renders the undertaking document");
}
for (const key of ["undertakingAccepted", "undertakingSignature"]) {
  const f = all.find((x) => x.key === key);
  if (!f?.required) fail(`${key} is not required — the application could submit unsigned`);
}

for (const f of all) {
  if (byKey.has(f.key)) fail(`duplicate key "${f.key}" — the second would overwrite the first`);
  byKey.set(f.key, f);
}
if (!failures) ok(`${all.length} fields, every key unique`);

/* Repeater sub-keys must not collide with top-level ones either: they are
   stored inside the array, but a reader scanning for a key would find two. */
for (const f of all) {
  if (f.type !== "repeater") continue;
  if (!f.item?.length) fail(`repeater "${f.key}" has no item fields`);
  for (const sub of f.item ?? []) {
    if (byKey.has(sub.key) && byKey.get(sub.key) !== sub) {
      fail(`repeater "${f.key}" reuses the top-level key "${sub.key}"`);
    }
  }
}

console.log("\n=== conditions ===");
for (const f of all) {
  if (!f.showWhen) continue;
  const target = byKey.get(f.showWhen.key);
  if (!target) { fail(`"${f.key}" is shown when "${f.showWhen.key}" — which is not a field`); continue; }
  const opts = optionsFor(target);
  const { equals, notEquals } = f.showWhen;
  if (equals !== undefined && opts.length && !opts.includes(equals)) {
    fail(`"${f.key}" waits for ${f.showWhen.key} === "${equals}", which is not one of its options`);
  }
  if (notEquals !== undefined && opts.length && !opts.includes(notEquals)) {
    fail(`"${f.key}" waits for ${f.showWhen.key} !== "${notEquals}", which is not one of its options`);
  }
}
if (!failures) ok("every showWhen points at a real field and a real value");

console.log("\n=== options ===");
for (const f of all) {
  const needs = ["select", "radio", "multiselect"].includes(f.type);
  if (needs && optionsFor(f).length === 0) fail(`"${f.key}" is a ${f.type} with no options`);
  if (f.mustMatch && !byKey.has(f.mustMatch)) fail(`"${f.key}" must match "${f.mustMatch}", which does not exist`);
}
if (!failures) ok("every choice field offers choices");

console.log("\n=== visibility ===");
/* A required field nobody can reach cannot be answered, so the form could
   never be completed. Reachability here means: visible under SOME answer. */
for (const f of all) {
  if (!f.required || DECORATIVE.has(f.type) || !f.showWhen) continue;
  const target = byKey.get(f.showWhen.key);
  const candidates = [...optionsFor(target), "", true];
  const reachable = candidates.some((v) => fieldVisible(f, { [f.showWhen.key]: v }));
  if (!reachable) fail(`required field "${f.key}" can never be shown`);
}
ok("every required field is reachable");

console.log("\n=== documents ===");
const bachelor = documentsFor("Bachelor's degree (undergraduate)");
const master = documentsFor("Master's degree (postgraduate)");
if (!bachelor.some((d) => d.key === "SSC")) fail("Bachelor's applicants are not asked for SSC");
if (master.some((d) => d.key === "SSC")) fail("Master's applicants are asked for SSC");
if (!master.some((d) => d.key === "BACHELOR" && d.required)) fail("Master's applicants are not required to send a degree");
if (!master.some((d) => d.key === "CV" && d.required)) fail("Master's applicants are not required to send a CV");
for (const list of [bachelor, master]) {
  const keys = list.map((d) => d.key);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) fail(`duplicate document slots: ${dup.join(", ")}`);
}
ok(`bachelor ${bachelor.length} slots, master ${master.length} slots`);

const prefix = filenamePrefix("  o'neill-smith ", "muhammad ali");
if (prefix !== "ONEILLSMITH_Muhammadali") fail(`filename prefix came out "${prefix}"`);
else ok(`punctuation stripped from the filename prefix — ${prefix}`);
if (filenamePrefix("", "") !== "SURNAME_Name") fail("empty name does not fall back");

console.log("\n=== motivation ===");
if (buildMotivation({}) !== "") fail("an empty form still produces a letter");
const letter = buildMotivation({
  mQ1: "One.", mQ3: "Three.", givenName: "Ada", familyName: "Lovelace", prio1: "Computing",
});
if (!letter.includes("I am writing to apply for Computing.")) fail("the programme is missing from the draft");
if (!letter.includes("Three.")) fail("an answered question is missing from the draft");
if (letter.includes("undefined")) fail("an unanswered question leaked into the draft");
if (!letter.trimEnd().endsWith("Ada Lovelace")) fail("the draft is not signed");
ok("the draft skips unanswered questions and signs off");

console.log(
  failures === 0
    ? "\n  Application definition verified.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

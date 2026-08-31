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
import {
  ADMISSION_CHECKLIST,
  VISA_CHECKLIST,
  groupsFor,
  februaryRequirement,
  checklistProgress,
  itemIdsFor,
  familyStatus,
} from "../lib/application/checklist.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const steps = STUDY_APPLICATION.steps;
const all = steps.flatMap((s) => s.fields);
const byKey = new Map();

console.log("\n=== structure ===");
if (steps.length !== 11) fail(`expected 11 sections, found ${steps.length}`);
else ok("eleven sections");

/* The checklist explains what a document must BE; section 09 is where it is
   uploaded. Reading it afterwards is reading it too late — an upload with the
   wrong attestation starts again from the Board office. */
const checklistAt = steps.findIndex((s) => s.key === "checklist");
const documentsAt = steps.findIndex((s) => s.key === "documents");
if (checklistAt === -1) fail("there is no checklist section");
else if (checklistAt > documentsAt) fail("the checklist comes after the uploads it governs");
else ok("the checklist comes before the uploads");

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

/* ── the document checklist ─────────────────────────────────────────── */
console.log("\n=== checklist ===");

const BACHELOR = "Bachelor's degree (undergraduate)";
const MASTER = "Master's degree (postgraduate)";
const FEB = "Spring / February 2027";
const AUTUMN = "Autumn / September 2026";

/* Every id has to be unique across BOTH lists — they share one map of ticks,
   so a collision would silently tick two different requirements at once. */
const everyId = [
  ...itemIdsFor(ADMISSION_CHECKLIST, MASTER),
  ...itemIdsFor(VISA_CHECKLIST, MASTER),
];
const clash = everyId.filter((id, i) => everyId.indexOf(id) !== i);
if (clash.length) fail(`checklist ids collide: ${[...new Set(clash)].join(", ")}`);
else ok(`${everyId.length} checklist items, every id unique across both lists`);

/* A Bachelor's applicant is not asked about a Master's degree they do not have. */
const forBachelor = groupsFor(ADMISSION_CHECKLIST, BACHELOR).map((g) => g.id);
const forMaster = groupsFor(ADMISSION_CHECKLIST, MASTER).map((g) => g.id);
if (forBachelor.includes("master")) fail("a Bachelor's applicant is shown the Master's group");
if (!forMaster.includes("master")) fail("a Master's applicant is not shown the Master's group");
if (!forBachelor.includes("ssc") || !forBachelor.includes("hssc")) {
  fail("the school groups are missing for a Bachelor's applicant");
}
ok(`bachelor sees ${forBachelor.length} groups, master ${forMaster.length}`);

/* The February rule must appear only for February, and must name the
   applicant's OWN last qualification rather than restating the general rule. */
if (februaryRequirement(AUTUMN, BACHELOR) !== null) {
  fail("the February requirement shows for an autumn intake");
}
const febBachelor = februaryRequirement(FEB, BACHELOR);
const febMaster = februaryRequirement(FEB, MASTER);
if (!febBachelor) fail("no February requirement for a February Bachelor's applicant");
else if (!/Intermediate/i.test(febBachelor.document)) {
  fail(`February/Bachelor's names "${febBachelor.document}" as the last qualification`);
}
if (!febMaster) fail("no February requirement for a February Master's applicant");
else if (!/Bachelor/i.test(febMaster.document)) {
  fail(`February/Master's names "${febMaster.document}" as the last qualification`);
}
if (febBachelor && febMaster && febBachelor.document === febMaster.document) {
  fail("both levels are told the same document needs apostilling");
}
ok("the February rule names the right document for each level");

/* Attestation chains are the part that sends applications back. */
const chainOf = (id) =>
  ADMISSION_CHECKLIST.groups.find((g) => g.id === id)?.attestation?.chain.join(" → ");
for (const [id, expected] of [
  ["ssc", "Board → IBCC → MOFA"],
  ["hssc", "Board → IBCC → MOFA"],
  ["bachelor", "HEC → MOFA"],
  ["master", "HEC → MOFA"],
]) {
  if (chainOf(id) !== expected) fail(`${id} attestation reads "${chainOf(id)}", expected "${expected}"`);
}
if (ADMISSION_CHECKLIST.groups.find((g) => g.id === "passport")?.attestation) {
  fail("the passport group claims an attestation it does not need");
}
ok("attestation chains are as the document states");

/* Progress counts only what applies. */
const ids = itemIdsFor(ADMISSION_CHECKLIST, BACHELOR);
const empty = checklistProgress(ADMISSION_CHECKLIST, BACHELOR, {});
if (empty.done !== 0 || empty.percent !== 0) fail("an untouched checklist is not at zero");
const everyTick = Object.fromEntries(ids.map((id) => [id, true]));
const full = checklistProgress(ADMISSION_CHECKLIST, BACHELOR, everyTick);
if (full.percent !== 100) fail(`a fully ticked checklist reads ${full.percent}%`);
/* Ticking a Master's item must not move a Bachelor's applicant's bar. */
const strayed = checklistProgress(ADMISSION_CHECKLIST, BACHELOR, {
  ...everyTick,
  "master-certificate": true,
});
if (strayed.total !== full.total) fail("an inapplicable tick changed the total");
ok("progress counts only the groups that apply");

/* ── applying with family ───────────────────────────────────────────── */
console.log("\n=== family ===");

/* The options are the ones section 07 actually offers. If that list is ever
   reworded, these break — which is the point: familyStatus reads the answer,
   so a rewording that it does not recognise would silently tell somebody
   bringing a spouse that they are travelling alone. */
const dependantsField = STUDY_APPLICATION.steps
  .flatMap((s) => s.fields)
  .find((f) => f.key === "dependants");
if (!dependantsField) fail("section 07 no longer asks who is travelling");
else {
  for (const option of dependantsField.options ?? []) {
    const status = familyStatus(option);
    const shouldFlag = /spouse/i.test(option);
    if (status.travellingWithFamily !== shouldFlag) {
      fail(`"${option}" reads as ${status.travellingWithFamily ? "family" : "alone"}`);
    }
    if (shouldFlag && !status.who) fail(`"${option}" flags family but names nobody`);
    if (!status.headline || !status.body) fail(`"${option}" produces an empty panel`);
  }
  ok(`all ${(dependantsField.options ?? []).length} answers map to a family status`);
}

/* Spouse and children must not be described as a spouse alone. */
const withChildren = familyStatus("Yes, spouse and children");
const spouseOnly = familyStatus("Yes, spouse");
if (withChildren.who === spouseOnly.who) fail("spouse-and-children reads the same as spouse");
if (!/children/i.test(withChildren.who ?? "")) fail("children are not named");
ok("who is travelling is named as they told us");

/* Unanswered is not the same as "alone" — it is a prompt to answer. */
const unanswered = familyStatus("");
if (unanswered.answered) fail("an empty answer counts as answered");
if (unanswered.travellingWithFamily) fail("an empty answer assumes family");
const undecided = familyStatus("Undecided");
if (!undecided.answered) fail("Undecided is treated as never asked");
if (undecided.travellingWithFamily) fail("Undecided assumes family");
ok("unanswered and undecided are handled apart from travelling alone");

console.log(
  failures === 0
    ? "\n  Application definition verified.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

/**
 * THE SHIPPED SCHEMA, EXERCISED AS THE APP WILL EXERCISE IT.
 *
 *   npm run verify:migrator
 *
 * db:verify applies the .sql FILES. Production applies the GENERATED MODULE,
 * through the admin screen. Those are two different artefacts, and verifying
 * only the first proves nothing about the second — a transcription step that
 * is never tested is a transcription step that will eventually be wrong.
 *
 * So: apply the module, twice, exactly as applyPending() would — every
 * migration in one transaction, recorded in schema_migrations, skipping what
 * is already there. The second pass must apply nothing and must not error,
 * because a super admin pressing the button twice is not a scenario, it is
 * Tuesday.
 */
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MIGRATIONS } from "../lib/db/schema-sql.generated.ts";

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const ok = (msg) => console.log(`  ok    ${msg}`);

/* 1 ── the module must match the files it was generated from ------------- */
console.log("\nTranscription\n");
const DIR = path.join(process.cwd(), "lib", "db", "migrations");
const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();

if (files.length !== MIGRATIONS.length) {
  fail(`${files.length} .sql files but ${MIGRATIONS.length} in the module — run npm run db:gen`);
} else {
  ok(`${files.length} migrations present`);
}

for (const file of files) {
  const entry = MIGRATIONS.find((m) => m.name === file);
  if (!entry) { fail(`${file} missing from the module`); continue; }
  const body = await fs.readFile(path.join(DIR, file), "utf8");
  if (entry.sql !== body) { fail(`${file} text differs from the file`); continue; }
  const expected = createHash("sha256").update(body).digest("hex").slice(0, 16);
  if (entry.checksum !== expected) fail(`${file} checksum ${entry.checksum} != ${expected}`);
  else ok(`${file}  ${entry.checksum}`);
}

/* 2 ── apply it the way applyPending does, twice -------------------------- */
const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

async function pass(db, label) {
  console.log(`\n${label}\n`);
  await db.exec(LEDGER);
  const seen = new Map(
    (await db.query("SELECT name, checksum FROM schema_migrations")).rows.map((r) => [
      r.name, r.checksum,
    ])
  );
  let applied = 0;
  for (const m of MIGRATIONS) {
    if (seen.has(m.name)) {
      if (seen.get(m.name) !== m.checksum) fail(`${m.name} recorded with a different checksum`);
      continue;
    }
    try {
      await db.exec("BEGIN");
      await db.exec(m.sql);
      await db.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
        m.name, m.checksum,
      ]);
      await db.exec("COMMIT");
      applied++;
    } catch (error) {
      await db.exec("ROLLBACK").catch(() => {});
      fail(`${m.name}: ${String(error.message).split("\n")[0]}`);
      return applied;
    }
  }
  ok(`applied ${applied}`);
  return applied;
}

const db = new PGlite();
const first = await pass(db, "First run");
if (first !== MIGRATIONS.length) fail(`first run applied ${first} of ${MIGRATIONS.length}`);

const second = await pass(db, "Second run (idempotency)");
if (second !== 0) fail(`second run applied ${second} migrations — it must apply none`);

/* 3 ── the ledger, and the things that were actually missing in production */
console.log("\nResult\n");
const rows = (await db.query("SELECT name FROM schema_migrations ORDER BY name")).rows;
if (rows.length !== MIGRATIONS.length) fail(`ledger has ${rows.length} rows`);
else ok(`ledger has ${rows.length} rows, no duplicates`);

const must = [
  ["fee_submissions", "SELECT to_regclass('public.fee_submissions') AS t"],
  ["documents.storage_provider",
   "SELECT 1 AS t FROM information_schema.columns WHERE table_name='documents' AND column_name='storage_provider'"],
];
for (const [label, q] of must) {
  const r = (await db.query(q)).rows[0];
  if (r && r.t) ok(`${label} exists`); else fail(`${label} MISSING`);
}

console.log(
  failures === 0
    ? "\n  Shipped schema verified — applies cleanly, applies once.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

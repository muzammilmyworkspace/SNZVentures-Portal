/**
 * BUNDLE THE MIGRATIONS INTO ONE PASTE-READY FILE.
 *
 *   npm run db:bundle          →  writes migrations.sql
 *
 * WHY THIS EXISTS
 * `npm run db:migrate` is the right way to apply these, and it needs
 * DATABASE_URL, a clone and a working Node install. When that is not to hand —
 * or when the person who can reach the database is not the person with the
 * repository — the schema stays unapplied and every feature that depends on it
 * fails with `relation ... does not exist`. That is a bad reason to be stuck.
 *
 * This produces a single file to paste into Supabase's SQL editor.
 *
 * IT RECORDS ITSELF, which is the part that matters. A hand-pasted migration
 * that does not write to `schema_migrations` leaves the tracking table saying
 * the migration never ran, so the next `db:migrate` tries it again. Every
 * statement here is already idempotent (IF NOT EXISTS, ADD COLUMN IF NOT
 * EXISTS), so a re-run would be harmless — but the tracking would stay wrong
 * for good, and the next person would have no way to know what is applied.
 *
 * The checksum is computed the same way migrate.mjs computes it, so a file
 * applied this way is indistinguishable from one applied by the runner.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const DIR = path.join(process.cwd(), "lib", "db", "migrations");
const OUT = path.join(process.cwd(), "migrations.sql");

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
if (!files.length) {
  console.error("No migrations found in lib/db/migrations.");
  process.exit(1);
}

const parts = [
  "-- =====================================================================",
  "-- SnZ Ventures portal — full schema, safe to run more than once.",
  "--",
  "-- Paste this whole file into the Supabase SQL editor and run it.",
  "--   Supabase dashboard → SQL Editor → New query → paste → Run",
  "--",
  "-- Every statement is idempotent, so running it against a database that is",
  "-- already up to date changes nothing. It also records each migration in",
  "-- schema_migrations, so `npm run db:migrate` stays in step afterwards and",
  "-- will not try to re-apply what you have just run.",
  `-- Generated ${new Date().toISOString()} from ${files.length} migration files.`,
  "-- =====================================================================",
  "",
  "CREATE TABLE IF NOT EXISTS schema_migrations (",
  "  name        TEXT PRIMARY KEY,",
  "  checksum    TEXT NOT NULL,",
  "  applied_at  timestamptz NOT NULL DEFAULT now()",
  ");",
  "",
];

for (const file of files) {
  const body = readFileSync(path.join(DIR, file), "utf8");
  const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);

  parts.push(
    "",
    "-- ---------------------------------------------------------------------",
    `-- ${file}`,
    "-- ---------------------------------------------------------------------",
    body.trimEnd(),
    "",
    "INSERT INTO schema_migrations (name, checksum)",
    `VALUES ('${file}', '${checksum}')`,
    "ON CONFLICT (name) DO NOTHING;",
    ""
  );
}

writeFileSync(OUT, parts.join("\n"), "utf8");
console.log(`\n  Wrote ${path.relative(process.cwd(), OUT)} — ${files.length} migrations.\n`);
console.log("  Supabase dashboard → SQL Editor → New query → paste the file → Run.");
console.log("  Safe to run more than once; it records itself so db:migrate stays in step.\n");
for (const f of files) console.log(`    ${f}`);
console.log("");

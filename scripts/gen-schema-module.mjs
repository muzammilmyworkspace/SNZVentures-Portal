/**
 * SHIP THE SCHEMA WITH THE APP.
 *
 *   npm run db:gen        regenerate lib/db/schema-sql.generated.ts
 *   npm run db:gen -- --check   fail if it is out of date (used by verify)
 *
 * WHY A GENERATED MODULE AND NOT fs.readFile
 * The migrations are .sql files on disk, and the server bundle does not
 * reliably carry files nothing imports. Reading them at runtime works locally
 * and then returns ENOENT on the deployment, which is the worst possible place
 * to discover it. Importing a real module means the bundler can see the
 * dependency, so the SQL is either in the build or the build fails.
 *
 * The .sql files stay the source of truth — this is a transcription of them,
 * checked by --check in CI so the two cannot drift.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const DIR = path.join(process.cwd(), "lib", "db", "migrations");
const OUT = path.join(process.cwd(), "lib", "db", "schema-sql.generated.ts");
const check = process.argv.includes("--check");

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const entries = files.map((name) => {
  const sql = readFileSync(path.join(DIR, name), "utf8");
  // Identical to migrate.mjs, so a migration applied by either route records
  // the same checksum and neither re-runs the other's work.
  const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
  return { name, sql, checksum };
});

const body = `// GENERATED FILE — DO NOT EDIT.
// Source: lib/db/migrations/*.sql  ·  Regenerate: npm run db:gen
//
// The schema, compiled into the app so it can be applied from the admin area
// on a deployment that has no shell. See scripts/gen-schema-module.mjs.

export type Migration = { name: string; sql: string; checksum: string };

export const MIGRATIONS: readonly Migration[] = [
${entries
  .map(
    (e) =>
      `  {\n    name: ${JSON.stringify(e.name)},\n    checksum: ${JSON.stringify(
        e.checksum
      )},\n    sql: ${JSON.stringify(e.sql)},\n  },`
  )
  .join("\n")}
];
`;

if (check) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* missing counts as out of date */
  }
  if (current !== body) {
    console.error(
      "\n  ✗ lib/db/schema-sql.generated.ts is out of date.\n" +
        "    A migration changed but the shipped copy did not.\n" +
        "    Run:  npm run db:gen\n"
    );
    process.exit(1);
  }
  console.log(`  Schema module is in step with ${files.length} migration files.`);
  process.exit(0);
}

writeFileSync(OUT, body, "utf8");
console.log(`\n  Wrote lib/db/schema-sql.generated.ts — ${files.length} migrations.\n`);
for (const e of entries) console.log(`    ${e.name}  ${e.checksum}`);
console.log("");

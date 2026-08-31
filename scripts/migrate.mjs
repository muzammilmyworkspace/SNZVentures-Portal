/**
 * Migration runner.
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:migrate -- --dry list pending without applying
 *
 * Migrations are plain .sql files in lib/db/migrations, applied in filename
 * order, each inside a transaction, and recorded in schema_migrations so they
 * run exactly once. No ORM, no codegen — the schema is readable SQL that any
 * DBA can audit.
 */
// Loads .env.local so `npm run db:*` works as the error messages promise.
import "./lib/env.mjs";
import postgres from "postgres";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const DIR = path.join(process.cwd(), "lib", "db", "migrations");
const dry = process.argv.includes("--dry");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "\n  DATABASE_URL is not set.\n\n" +
      "  Set it in .env.local for local runs, or export it in your shell:\n" +
      "    DATABASE_URL='postgresql://user:pass@host/db?sslmode=require' npm run db:migrate\n"
  );
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  ssl: url.includes("sslmode=disable") ? false : "require",
  prepare: false,
  // Migrations contain multiple statements per file.
  onnotice: () => {},
});

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied = await sql`SELECT name, checksum FROM schema_migrations`;
  const appliedMap = new Map(applied.map((r) => [r.name, r.checksum]));

  let ran = 0;
  for (const file of files) {
    const body = await fs.readFile(path.join(DIR, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);

    if (appliedMap.has(file)) {
      if (appliedMap.get(file) !== checksum) {
        console.error(
          `\n  ✗ ${file} has changed since it was applied.\n` +
            "    Never edit an applied migration — add a new one instead.\n"
        );
        process.exit(1);
      }
      continue;
    }

    if (dry) {
      console.log(`  pending  ${file}`);
      ran++;
      continue;
    }

    process.stdout.write(`  applying ${file} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        INSERT INTO schema_migrations (name, checksum) VALUES (${file}, ${checksum})
      `;
    });
    console.log("done");
    ran++;
  }

  console.log(
    ran === 0
      ? "\n  Schema is up to date.\n"
      : dry
        ? `\n  ${ran} migration(s) pending.\n`
        : `\n  Applied ${ran} migration(s).\n`
  );
} catch (error) {
  console.error("\n  Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

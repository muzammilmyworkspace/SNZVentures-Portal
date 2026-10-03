/**
 * BACK UP THE PORTAL'S DATA.
 *
 *   npm run backup:data
 *
 * The code backup in Backups/ holds every file in this repository, which
 * includes the schema — lib/db/migrations is the database's shape. What it does
 * NOT hold is the rows: the students, their applications, the documents, the
 * fees. Those live in Supabase, and nothing in a folder copy reaches them.
 *
 * This writes them out, one JSON file per table, plus a manifest with a row
 * count for each. Together with the migrations in this repository, that is
 * everything needed to stand the portal up again from nothing.
 *
 * EXPORT ONLY, DELIBERATELY. There is no restore mode and no write of any
 * kind. A backup tool that can also write to a production database is a tool
 * that can destroy the thing it was meant to protect, usually by being run
 * with the wrong connection string at two in the morning. Restoring is rare,
 * it is not an emergency the moment it happens, and it should be a deliberate
 * act with somebody reading each step — see the README this writes.
 *
 * WHICH DATABASE: whatever DATABASE_URL points at, and it says which host
 * before it starts. That matters, because .env.development.local usually
 * points at the LOCAL dev database — backing that up is backing up nothing.
 * To back up production, give it the production string for one command:
 *
 *   DATABASE_URL="postgres://…" npm run backup:data
 *
 * It never prints the connection string or the password.
 */
import "./lib/env.mjs";
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error(`
  No DATABASE_URL.

  Put it in .env.local, or give it for this one command:

    DATABASE_URL="postgres://…" npm run backup:data

  The production string is in Supabase: Project → Connect → the pooler URI.
`);
  process.exit(1);
}

/**
 * Percent-encode the userinfo, but only if the string is not already a URL
 * Node can parse. Lifted from change-superadmin-email.mjs — see its comment
 * for why parsing first is what makes this safe to run twice.
 */
function normalizeDbUrl(value) {
  try {
    new URL(value);
    return value;
  } catch {
    /* fall through */
  }
  const sep = value.indexOf("://");
  if (sep === -1) return value;
  const scheme = value.slice(0, sep + 3);
  const rest = value.slice(sep + 3);
  const at = rest.lastIndexOf("@");
  if (at === -1) return value;
  const userinfo = rest.slice(0, at);
  const hostAndPath = rest.slice(at + 1);
  const colon = userinfo.indexOf(":");
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const pass = colon === -1 ? null : userinfo.slice(colon + 1);
  return `${scheme}${encodeURIComponent(user)}${
    pass === null ? "" : `:${encodeURIComponent(pass)}`
  }@${hostAndPath}`;
}

const url = normalizeDbUrl(raw);

/*
  The host, so nobody discovers afterwards that they backed up localhost.
  Host and database name only — never the userinfo.
*/
let where = "an unparseable connection string";
try {
  const u = new URL(url);
  where = `${u.hostname}${u.pathname}`;
} catch {
  /* keep the fallback */
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const out =
  process.argv.find((a) => a.startsWith("--out="))?.slice(6) ??
  path.join("..", "Backups", `portal-data-${stamp}`);

console.log(`
  Backing up   ${where}
  Writing to   ${path.resolve(out)}
`);

fs.mkdirSync(out, { recursive: true });

const sql = postgres(url, {
  max: 1,
  ssl: url.includes("sslmode=disable") ? false : "require",
  prepare: false,
  /*
    Everything comes back as a string. A row written out as text and read back
    as text is the row that went in; letting the driver turn a numeric into a
    float or a timestamptz into a local Date is how a backup quietly stops
    being a copy. JSON columns are the exception — they are already structured
    and re-encoding them as a string would nest the quoting.
  */
  types: {
    bigint: postgres.BigInt,
  },
  transform: { undefined: null },
});

/**
 * JSON.stringify cannot serialize a BigInt and throws rather than skipping it,
 * so one bigint column took a whole table out of the backup — audit_logs, as
 * it happens, which is the table whose entire purpose is being the record.
 *
 * Written as a string, not a number: a JS number loses precision above 2^53
 * and that is the silent kind of wrong. Postgres reads a quoted integer back
 * into a bigint column without complaint.
 */
const safe = (_key, value) => (typeof value === "bigint" ? value.toString() : value);

let failures = 0;

try {
  /*
    Ordinary tables in `public`, which is where every migration puts things.
    Views are skipped: a view is a query, it is already in the migrations, and
    writing one out would duplicate rows that are backed up under their own
    table. Supabase's internal schemas are not ours to copy.
  */
  const tables = await sql`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  if (!tables.length) {
    console.error("  No tables found. Is this the right database?\n");
    process.exit(1);
  }

  const manifest = {
    takenAt: new Date().toISOString(),
    database: where,
    tables: {},
  };

  let total = 0;

  for (const { name } of tables) {
    try {
      /*
        Read in one go. These tables are small — the largest is documents, and
        it holds metadata rather than file bytes. If one ever grows past what
        fits in memory, this is the line that needs a cursor, and the row count
        in the manifest is what will say so first.
      */
      const rows = await sql`SELECT * FROM ${sql(name)}`;
      const plain = rows.map((r) => ({ ...r }));

      fs.writeFileSync(
        path.join(out, `${name}.json`),
        JSON.stringify(plain, safe, 2),
        "utf8"
      );

      manifest.tables[name] = plain.length;
      total += plain.length;
      console.log(`  ${String(plain.length).padStart(6)}  ${name}`);
    } catch (error) {
      failures++;
      manifest.tables[name] = { error: error.message?.split("\n")[0] ?? "failed" };
      console.log(`  FAILED  ${name} — ${error.message?.split("\n")[0]}`);
    }
  }

  /*
    The migration filenames go in the manifest, not just the count. Restoring
    rows into a schema they were not written against is the one way this backup
    can silently fail, and this is what lets somebody check first.
  */
  try {
    manifest.migrations = fs
      .readdirSync(path.join(process.cwd(), "lib", "db", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    /* not fatal — the row data is the point */
  }

  fs.writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(out, "README.md"),
    `# Portal data — ${manifest.takenAt.slice(0, 10)}

Every row in every table of \`${where}\`, one JSON file per table.
\`manifest.json\` lists the row counts and the migrations this schema was at.

**This folder holds personal data** — names, contact details, passport numbers,
application answers, payment declarations. It belongs on this machine or an
encrypted drive. Not a shared folder, not a chat, not a repository.

## What a restore looks like

The schema is not in here, because it does not need to be: it is
\`lib/db/migrations\` in the portal repository, and \`manifest.json\` names the
exact migrations this data was written against.

1. Create an empty database.
2. Run the migrations against it — \`npm run db:migrate\` — and check the list
   matches \`migrations\` in \`manifest.json\`. If the repository has moved on
   since, restore the repository to that point first.
3. Load the JSON files, parents before children (\`users\` first; then
   \`profiles\`, \`cases\`, \`documents\`, \`staff_assignments\`; then everything
   that points at a case).
4. Reset the sequences on any table with a numeric id.

Step 3 is deliberately not a script. Loading rows into a live database is the
one operation here that can destroy data rather than copy it, and it should be
somebody typing with the manifest open — not a flag on a backup tool that has
one job and does it read-only.

## What is still not in here

**Uploaded files.** Document rows are metadata; the files themselves are in
blob storage. Those are backed up where they live.
`,
    "utf8"
  );

  console.log(`
  ${total} rows across ${tables.length} tables${failures ? ` — ${failures} FAILED` : ""}
  ${path.resolve(out)}
`);
} catch (error) {
  console.error(`\n  Could not read the database: ${error.message?.split("\n")[0]}\n`);
  failures++;
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(failures ? 1 : 0);

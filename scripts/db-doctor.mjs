/**
 * Checks that a DATABASE_URL is actually fit for production before you trust
 * it with client data.
 *
 *   npm run db:doctor
 *
 * Written because the failure modes here are quiet ones. A direct (unpooled)
 * Supabase connection works perfectly in testing and then exhausts connections
 * under real serverless traffic. A public-schema grant left in place leaks
 * every table to the browser-published anon key. Neither shows up as an error
 * until it matters.
 *
 * Read-only. It never writes, and it prints no credential.
 */
// Loads .env.local so `npm run db:*` works as the error messages promise.
import "./lib/env.mjs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

let failures = 0;
let warnings = 0;

const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => { warnings++; console.log(`  warn  ${m}`); };
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };

/** Never print the password, even in a diagnostic. */
function describe(raw) {
  try {
    const u = new URL(raw);
    return { host: u.hostname, port: u.port || "5432", db: u.pathname.slice(1), user: u.username, params: u.searchParams };
  } catch {
    return null;
  }
}

const parts = describe(url);
console.log("\nConnection\n");

if (!parts) {
  fail("DATABASE_URL is not a parseable URL");
  process.exit(1);
}
ok(`host ${parts.host}:${parts.port}  db ${parts.db}  user ${parts.user}`);

const isSupabase = /supabase\.(com|co|net)$/.test(parts.host);

// Supabase's direct host (db.<ref>.supabase.co:5432) opens one backend per
// connection. Serverless functions scale horizontally, so that runs out fast.
// The pooler (…pooler.supabase.com, port 6543) multiplexes instead.
if (isSupabase) {
  const pooled = parts.host.includes("pooler") || parts.port === "6543";
  if (pooled) ok("using the Supabase connection pooler");
  else fail("direct connection — use the POOLER string (…pooler.supabase.com, port 6543) for serverless");
}

if (parts.params.get("sslmode") === "disable") warn("sslmode=disable — acceptable locally, never in production");
else ok("TLS not disabled");

const sql = postgres(url, {
  max: 1,
  ssl: url.includes("sslmode=disable") ? false : "require",
  prepare: false,
  connect_timeout: 15,
});

const EXPECTED = [
  "users", "user_tokens", "profiles", "student_profiles", "professional_profiles",
  "business_profiles", "staff_assignments", "cases", "opportunities",
  "applications", "documents", "tasks", "appointments", "conversations",
  "messages", "notifications", "audit_logs",
];

try {
  console.log("\nServer\n");

  const [v] = await sql`SELECT current_setting('server_version_num')::int AS num, version() AS full`;
  const major = Math.floor(v.num / 10000);
  if (major >= 13) ok(`PostgreSQL ${major} (gen_random_uuid available in core)`);
  else fail(`PostgreSQL ${major} — the schema needs 13 or newer`);

  console.log("\nSchema\n");

  const tables = await sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
  `;
  const have = new Set(tables.map((r) => r.table_name));
  const missing = EXPECTED.filter((t) => !have.has(t));

  if (!have.has("schema_migrations")) {
    fail("no migrations applied yet — run: npm run db:migrate");
  } else if (missing.length) {
    fail(`missing tables: ${missing.join(", ")} — run: npm run db:migrate`);
  } else {
    ok(`all ${EXPECTED.length} tables present`);
  }

  if (missing.length === 0) {
    console.log("\nExposure\n");

    const open = await sql`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
        AND c.relname = ANY(${EXPECTED})
    `;
    if (open.length) fail(`RLS is OFF on: ${open.map((r) => r.relname).join(", ")} — run: npm run db:migrate`);
    else ok("row level security enabled on every table");

    const policies = await sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
    if (policies[0].n === 0) ok("no policy re-opens a table");
    else warn(`${policies[0].n} policy(ies) exist — confirm each is intentional`);

    if (isSupabase) {
      // The decisive question on Supabase: can the browser-published anon key
      // read anything? Ask Postgres directly rather than assuming.
      const roles = await sql`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')`;
      if (roles.length === 0) {
        warn("anon/authenticated roles absent — unusual for Supabase, check the project");
      } else {
        const leaks = [];
        for (const { rolname } of roles) {
          const [r] = await sql`
            SELECT bool_or(has_table_privilege(${rolname}, c.oid, 'SELECT')) AS can_read
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY(${EXPECTED})
          `;
          if (r.can_read) leaks.push(rolname);
        }
        if (leaks.length) fail(`${leaks.join(" and ")} still hold SELECT on portal tables — run: npm run db:migrate`);
        else ok("anon and authenticated hold no table privileges");
      }
    }

    console.log("\nAccounts\n");

    const [admins] = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'super_admin'`;
    if (admins.n === 0) warn("no super admin yet — run: npm run db:bootstrap -- --email you@example.com");
    else ok(`${admins.n} super admin account(s)`);

    const [clients] = await sql`SELECT count(*)::int AS n FROM users WHERE role IN ('student','professional','business')`;
    ok(`${clients.n} client account(s)`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message.split("\n")[0] : String(error));
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

console.log(
  failures === 0
    ? `\n  Database is production-ready${warnings ? ` (${warnings} warning(s))` : ""}.\n`
    : `\n  ${failures} problem(s) must be fixed before going live.\n`
);
process.exit(failures === 0 ? 0 : 1);

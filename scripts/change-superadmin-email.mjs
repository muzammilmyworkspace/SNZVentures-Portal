/**
 * Moves an account to a different sign-in address, from the command line.
 *
 *   node scripts/change-superadmin-email.mjs                  # look only
 *   node scripts/change-superadmin-email.mjs --apply          # do it
 *   node scripts/change-superadmin-email.mjs --from a@b --to c@d --apply
 *
 * Defaults move ceo@snzventures.com → info@snzventures.com.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The portal already moves an address properly: Settings asks for the password,
 * mails a single-use link to the new address, warns the old one, and only then
 * writes the change (app/api/portal/email/confirm/route.ts). That path is the
 * right one and this script is not a replacement for it.
 *
 * It exists because that path needs a mail transport, and on a deployment where
 * neither RESEND_API_KEY nor MAIL_WEBHOOK_URL is set, `mailConfigured()` is
 * false and the request is refused with a 503 — leaving no way to move the
 * address at all. Same reason `bootstrap-admin.mjs --reset-password` exists.
 *
 * Deliberately CLI-only: it requires direct database credentials, so anyone who
 * can run it already holds more access than the account being changed.
 *
 * This performs the SAME writes the confirm route performs — the address, the
 * verified flag, the session epoch and the audit row — so the result is not
 * distinguishable from having used the UI, except that `meta.via` says so.
 */
// Loads .env.local so this works as the other db scripts promise.
import "./lib/env.mjs";
import postgres from "postgres";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const FROM = (arg("from") ?? "ceo@snzventures.com").trim().toLowerCase();
const TO = (arg("to") ?? "info@snzventures.com").trim().toLowerCase();
const APPLY = process.argv.includes("--apply");

if (FROM === TO) {
  console.error("\n  --from and --to are the same address. Nothing to do.\n");
  process.exit(1);
}

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error(
    "\n  DATABASE_URL is not set. Put it in .env.local, or export it for one run.\n"
  );
  process.exit(1);
}

/**
 * Percent-encode the username and password, but ONLY if the string is not
 * already a URL Node can parse.
 *
 * Supabase generates passwords containing '@', '#', '$', '%' and '!'. Pasted
 * into a connection string as-is they are not a valid URL — '@' ends the
 * userinfo early and '#' starts a fragment — so the driver throws
 * ERR_INVALID_URL before it ever reaches the network, and the error names the
 * whole string, password included.
 *
 * Parsing first is what makes this safe to run on an already-correct URL: a
 * string that parses is passed through untouched, so a password written as
 * %40 is never double-encoded into %2540.
 */
function normalizeDbUrl(value) {
  try {
    new URL(value);
    return value;
  } catch {
    // Not parseable — fall through and try to repair the userinfo.
  }

  const sep = value.indexOf("://");
  if (sep === -1) return value;

  const scheme = value.slice(0, sep + 3);
  const rest = value.slice(sep + 3);

  // The LAST '@' separates userinfo from host: any earlier one is in the
  // password. Splitting on the first '@' is the usual bug here.
  const at = rest.lastIndexOf("@");
  if (at === -1) return value;

  const userinfo = rest.slice(0, at);
  const hostAndPath = rest.slice(at + 1);

  const colon = userinfo.indexOf(":");
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const pass = colon === -1 ? null : userinfo.slice(colon + 1);

  const encoded =
    encodeURIComponent(user) + (pass === null ? "" : `:${encodeURIComponent(pass)}`);

  return `${scheme}${encoded}@${hostAndPath}`;
}

const url = normalizeDbUrl(raw);

// Say it happened, without printing either version — this file holds the
// database password and the whole point is that it never reaches a log.
if (url !== raw) {
  console.log("\n  (Connection string contained characters that needed encoding — fixed.)");
}

// Same connection parameters as bootstrap-admin.mjs — keep these in sync.
const sql = postgres(url, {
  max: 1,
  ssl: url.includes("sslmode=disable") ? false : "require",
  prepare: false,
});

/** Both addresses at once, so a collision is visible before anything is written. */
function look() {
  return sql`
    SELECT id, email, name, role, status, email_verified
      FROM users
     WHERE lower(email) IN (${FROM}, ${TO})
  `;
}

function show(rows, heading) {
  console.log(`\n  ${heading}`);
  if (!rows.length) {
    console.log("    (no matching rows)");
    return;
  }
  for (const r of rows) {
    console.log(
      `    ${r.email}\n      id=${r.id}  role=${r.role}  status=${r.status}  ` +
        `verified=${r.email_verified}\n      name=${r.name}`
    );
  }
}

try {
  const before = await look();
  show(before, "BEFORE");

  const source = before.find((r) => r.email.toLowerCase() === FROM);
  const taken = before.find((r) => r.email.toLowerCase() === TO);

  /*
    Refuse rather than guess. Each of these means the situation is not the
    plain rename this script is for, and the cost of a wrong write to a
    production users table is not worth the convenience of carrying on.
  */
  if (!source) {
    console.error(`\n  STOP: no account uses ${FROM}. Nothing was changed.\n`);
    process.exit(1);
  }
  if (taken) {
    console.error(
      `\n  STOP: ${TO} already belongs to another account (id=${taken.id}).\n` +
        `  That is a merge, not a rename — decide what happens to each account\n` +
        `  first. Nothing was changed.\n`
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log(
      `\n  Dry run — nothing was written.\n\n` +
        `  Would move  ${FROM}\n` +
        `          to  ${TO}\n` +
        `  on account  id=${source.id} (role ${source.role})\n\n` +
        `  Re-run with --apply to perform it.\n`
    );
    process.exit(0);
  }

  /*
    One transaction. The unique index on lower(email) is the last word: if the
    address were taken between the check above and this write, the UPDATE fails
    and the whole thing rolls back rather than half-applying.

    session_epoch + 1 ends every session this account holds. That is deliberate
    and matches how the codebase handles it elsewhere (migration 018): a live
    session still carries the OLD address inside its token, so without this the
    portal keeps showing the old one until the next sign-in. The password hash
    is NOT touched — the same password still works.
  */
  const [moved] = await sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE users
         SET email          = ${TO},
             email_verified = TRUE,
             session_epoch  = session_epoch + 1,
             updated_at     = now()
       WHERE id = ${source.id}
      RETURNING id, email, name, role
    `;
    if (rows.length !== 1) throw new Error(`expected 1 row updated, got ${rows.length}`);

    // The audit log is append-only and the confirm route writes this row on
    // every email change. Writing it keeps the trail complete; `via` records
    // that this went through the CLI rather than the UI.
    await tx`
      INSERT INTO audit_logs (actor_id, actor_email, action, entity, entity_id, meta)
      VALUES (
        ${source.id}, ${TO}, 'user.email_changed', 'user', ${source.id},
        ${tx.json({ from: FROM, to: TO, via: "cli" })}
      )
    `;
    return rows;
  });

  console.log(`\n  APPLIED  ${FROM} → ${moved.email}  (id=${moved.id}, role=${moved.role})`);
  show(await look(), "AFTER");
  console.log(
    `\n  Two things to know:\n` +
      `    - The password did not change. Sign in with ${TO} and the same one.\n` +
      `    - Every device was signed out on purpose, so the portal stops\n` +
      `      showing the old address.\n`
  );
} catch (err) {
  console.error(`\n  FAILED — nothing was committed.\n    ${err.message}\n`);

  /*
    Say what was actually dialled, because every failure below is a mismatch
    between what the operator believes is in .env.local and what is in it.

    Username, host, port and database name are not secrets — they are printed
    on the Supabase connection page. The password is the secret and is never
    read here, so this cannot leak it even by accident.
  */
  try {
    const u = new URL(url);
    console.error(
      `  Connected as:\n` +
        `    user      ${decodeURIComponent(u.username) || "(none)"}\n` +
        `    host      ${u.hostname}\n` +
        `    port      ${u.port || "(default)"}\n` +
        `    database  ${u.pathname.replace(/^\//, "") || "(none)"}\n` +
        `    password  ${u.password ? `(set, ${u.password.length} chars)` : "(EMPTY)"}\n`
    );
  } catch {
    console.error("  (Could not parse DATABASE_URL to report what was dialled.)\n");
  }

  /*
    Supabase retired IPv4 on the direct database host: db.<ref>.supabase.co
    now publishes an AAAA record and nothing else. On a network without IPv6
    that surfaces as ENOTFOUND, which reads like a typo in the hostname and
    sends people to check their spelling instead of their transport.
  */
  /*
    The pooler needs the project ref appended to the username. Supabase's own
    page shows it that way, but anyone editing a direct URL by hand changes the
    host and leaves the user alone — and the pooler then rejects a bare
    'postgres' as a bad password rather than an unknown user, which points the
    blame at the wrong field.
  */
  if (/password authentication failed/i.test(err.message)) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("pooler.supabase.com") && !u.username.includes(".")) {
        console.error(
          `  The host is the pooler but the user is plain '${u.username}'.\n` +
            `  On the pooler the user must carry the project ref:\n` +
            `      ${u.username}.<project-ref>\n` +
            `  Copy the whole URI from Supabase → Connection string → Session pooler\n` +
            `  rather than editing the direct one by hand.\n`
        );
      } else {
        console.error(`  Check the password itself — that is what the server rejected.\n`);
      }
    } catch {
      /* the block above already reported what it could */
    }
  }

  if (err.code === "ENOTFOUND" && /^db\..*\.supabase\.co$/.test(err.hostname ?? "")) {
    const ref = err.hostname.split(".")[1];
    console.error(
      `  That host resolves to an IPv6 address only, and this machine has no\n` +
        `  IPv6 route — so the name never resolves to anything reachable.\n\n` +
        `  Use the POOLER connection string instead (it has IPv4):\n` +
        `    Supabase → Project Settings → Database → Connection string → Session pooler\n\n` +
        `  It differs from the direct one in two places, not one:\n` +
        `    host becomes  aws-0-<region>.pooler.supabase.com\n` +
        `    user becomes  postgres.${ref}      (project ref appended)\n`
    );
  }

  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

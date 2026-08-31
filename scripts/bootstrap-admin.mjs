/**
 * Creates (or promotes) the first SUPER ADMIN.
 *
 *   npm run db:bootstrap -- --email you@example.com --name "Your Name"
 *
 * Deliberately a CLI task, not a web route or a seeded record:
 *   • no hardcoded credentials ever enter the repository
 *   • there is no public path to a staff role
 *   • the password is generated here and printed ONCE, never stored in plain
 *
 * If the account already exists it is promoted rather than duplicated, so this
 * is safe to re-run. Promotion alone does NOT touch the password.
 *
 *   npm run db:bootstrap -- --email you@example.com --reset-password
 *
 * `--reset-password` exists because there was otherwise no way back in. Reset
 * by email needs a mail transport, and on a deployment where that is not yet
 * configured a locked-out administrator had no recovery path at all — which,
 * with no public route to a staff role, means the whole admin side is lost.
 *
 * Deliberately CLI-only: it requires direct database credentials, so anyone
 * able to run it already holds more access than the account being reset.
 * Add `--password "..."` to choose the value yourself rather than have one
 * generated and printed.
 */
// Loads .env.local so `npm run db:*` works as the error messages promise.
import "./lib/env.mjs";
import postgres from "postgres";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email");
const name = arg("name") ?? "Super Admin";
const providedPassword = arg("password");

if (!email) {
  console.error(
    "\n  Usage: npm run db:bootstrap -- --email you@example.com --name \"Your Name\"\n"
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

// Same parameters as lib/auth/password.ts — keep these in sync.
async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, {
    N: 65536, r: 8, p: 1, maxmem: 160 * 1024 * 1024,
  });
  return ["scrypt", 65536, 8, 1, salt.toString("base64"), derived.toString("base64")].join("$");
}

/** Readable but high-entropy: 4 groups of 5 from a 32-char alphabet ≈ 100 bits. */
function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join("")).join("-");
}

const sql = postgres(url, {
  max: 1,
  ssl: url.includes("sslmode=disable") ? false : "require",
  prepare: false,
});

try {
  const existing = await sql`
    SELECT id, role FROM users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1
  `;

  if (existing[0]) {
    const wantsReset = process.argv.includes("--reset-password") || Boolean(providedPassword);
    const newPassword = wantsReset ? (providedPassword ?? generatePassword()) : null;

    if (newPassword) {
      const newHash = await hashPassword(newPassword);
      await sql`
        UPDATE users SET role = 'super_admin', status = 'active',
                         email_verified = TRUE, password_hash = ${newHash},
                         updated_at = now()
        WHERE id = ${existing[0].id}
      `;
      // Recorded as an EVENT, never with the value. An audit log holding
      // credentials is simply a second place they can leak from.
      await sql`
        INSERT INTO audit_logs (actor_email, action, entity, entity_id, meta)
        VALUES (${email}, 'auth.password_reset', 'user', ${existing[0].id},
                ${sql.json({ via: "bootstrap-cli" })})
      `;
    } else {
      await sql`
        UPDATE users SET role = 'super_admin', status = 'active',
                         email_verified = TRUE, updated_at = now()
        WHERE id = ${existing[0].id}
      `;
    }
    await sql`
      INSERT INTO audit_logs (actor_email, action, entity, entity_id, meta)
      VALUES (${email}, 'user.role_changed', 'user', ${existing[0].id},
              ${sql.json({ from: existing[0].role, to: "super_admin", via: "bootstrap" })})
    `;
    if (newPassword) {
      console.log("\n  ┌──────────────────────────────────────────────────────────");
      console.log("  │  PASSWORD RESET");
      console.log("  ├──────────────────────────────────────────────────────────");
      console.log(`  │  Email:    ${email}`);
      if (providedPassword) {
        console.log("  │  Password: (the one you supplied)");
      } else {
        console.log(`  │  Password: ${newPassword}`);
        console.log("  │");
        console.log("  │  Shown ONCE. Not stored in plain text anywhere.");
      }
      console.log("  └──────────────────────────────────────────────────────────\n");
    } else {
      console.log(`\n  Promoted existing account to super_admin: ${email}`);
      console.log("  Their existing password is unchanged.");
      console.log("  Add --reset-password to set a new one.\n");
    }
  } else {
    const password = providedPassword ?? generatePassword();
    const hash = await hashPassword(password);

    const rows = await sql`
      INSERT INTO users (email, name, role, status, password_hash, email_verified)
      VALUES (${email.toLowerCase()}, ${name}, 'super_admin', 'active', ${hash}, TRUE)
      RETURNING id
    `;
    await sql`INSERT INTO profiles (user_id) VALUES (${rows[0].id}) ON CONFLICT DO NOTHING`;
    await sql`
      INSERT INTO audit_logs (actor_email, action, entity, entity_id, meta)
      VALUES (${email}, 'admin.action', 'user', ${rows[0].id},
              ${sql.json({ created: "super_admin", via: "bootstrap" })})
    `;

    console.log("\n  ┌──────────────────────────────────────────────────────────");
    console.log("  │  SUPER ADMIN CREATED");
    console.log("  ├──────────────────────────────────────────────────────────");
    console.log(`  │  Email:    ${email}`);
    if (!providedPassword) {
      console.log(`  │  Password: ${password}`);
      console.log("  │");
      console.log("  │  This password is shown ONCE and is not stored anywhere");
      console.log("  │  in plain text. Save it now, then change it after first");
      console.log("  │  sign-in via Forgot password.");
    }
    console.log("  └──────────────────────────────────────────────────────────\n");
  }
} catch (error) {
  console.error("\n  Bootstrap failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

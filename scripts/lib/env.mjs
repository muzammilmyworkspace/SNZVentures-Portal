/**
 * Local env loading for the db/* scripts.
 *
 * Next.js reads .env.local automatically; a bare `node scripts/…` run does not.
 * Every db script told the operator to "set it in .env.local" and then failed
 * because nothing read that file — so the instruction was wrong rather than the
 * setup. This makes it true.
 *
 * Order matters: a variable already exported in the shell WINS over the file,
 * so `DATABASE_URL=… npm run db:migrate` still targets what the operator typed
 * and cannot be silently overridden by a stale local file. That is the safe
 * direction for a command that writes to a production database.
 *
 * Nothing here logs a value. These files hold the database password.
 */
import fs from "node:fs";
import path from "node:path";

const FILES = [".env.local", ".env"];

export function loadLocalEnv() {
  const loaded = [];

  for (const name of FILES) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;

    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq < 1) continue;

      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      // Shell wins. See the note above.
      if (process.env[key] !== undefined) continue;

      let value = line.slice(eq + 1).trim();
      // Strip one matching pair of surrounding quotes, keeping inner ones.
      if (value.length > 1 && /^(".*"|'.*')$/s.test(value)) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    loaded.push(name);
  }

  return loaded;
}

loadLocalEnv();

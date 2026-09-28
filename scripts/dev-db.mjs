/**
 * A REAL POSTGRES ON THIS MACHINE, FOR DEVELOPMENT ONLY.
 *
 *   npm run devdb:start
 *   npm run devdb:stop
 *
 * WHY THIS EXISTS
 *
 * Preview and Production share one Supabase project (see db-deploy.mjs), so
 * there is no spare hosted database to develop against. Pointing a dev server
 * at DATABASE_URL therefore means local, half-finished code writing to the
 * database real clients are using — including migrations, which run on build.
 * This gives that code somewhere else to go.
 *
 * PGlite is already a dependency and is what `db:verify` runs against, but it
 * is a library rather than a server: nothing can connect to it over a socket,
 * so the Next app cannot use it. This ships actual Postgres binaries instead,
 * which also means local behaviour matches production rather than approximating
 * it — enum casts, FOR UPDATE and partial indexes all behave the same way.
 *
 * Data lives in .dev-postgres/, which is gitignored. Delete it to start over.
 *
 * THE BINARIES ARE NOT A DEPENDENCY OF THIS PROJECT, deliberately. They are
 * 107 MB, and Vercel installs devDependencies during a build — so listing them
 * would add that download to every production deploy in exchange for something
 * only ever used on a laptop. Install them once, on the machine that needs it:
 *
 *   npm install --no-save embedded-postgres
 *
 * `--no-save` keeps them out of package.json, which is the point.
 *
 * NOT part of the deployment story. Nothing here ships, and nothing outside
 * development should ever read DEV_DATABASE_URL.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.resolve(root, ".dev-postgres/data");
const logFile = path.resolve(root, ".dev-postgres/server.log");

/* Only the Windows bundle is wired up, because that is the machine this is
   developed on. The package publishes per-platform binaries under the same
   layout, so adding another is a matter of naming it here. */
const binDir = path.resolve(root, "node_modules/@embedded-postgres/windows-x64/native/bin");

const HOST = "127.0.0.1";
/* 5433, not 5432: a developer with Postgres already installed should not have
   to stop it to work on this. */
const PORT = 5433;
const USER = "snzv";
const PASSWORD = "snzv_dev_only";

/*
  The `postgres` database, which initdb always creates. The app connects with
  postgres.js and has no "create the database if it is missing" step, so
  borrowing the one that is guaranteed to exist avoids needing createdb — which
  this binary bundle does not even ship.

  sslmode=disable matters: lib/db/client.ts uses TLS unless the URL says
  otherwise, and a local server has no certificate.
*/
export const DEV_DATABASE_URL =
  `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/postgres?sslmode=disable`;

function ensureInitialized() {
  if (existsSync(path.join(dataDir, "PG_VERSION"))) return;
  mkdirSync(dataDir, { recursive: true });
  const pwfile = path.resolve(root, ".dev-postgres/.pwfile");
  writeFileSync(pwfile, PASSWORD);
  execFileSync(path.join(binDir, "initdb.exe"), [
    "-D", dataDir,
    "-U", USER,
    "--pwfile", pwfile,
    "-A", "scram-sha-256",
  ], { encoding: "utf8" });
  console.log("  Initialised a new cluster in .dev-postgres/");
}

function start() {
  if (!existsSync(binDir)) {
    console.error(
      `\n  Postgres binaries are not installed.\n\n` +
        `  They are kept out of package.json on purpose — 107 MB that only a\n` +
        `  developer needs, which would otherwise download on every deploy.\n\n` +
        `  Install them here once:\n\n` +
        `    npm install --no-save embedded-postgres\n`
    );
    process.exit(1);
  }

  ensureInitialized();

  /*
    stdio "ignore", not the default pipe. pg_ctl daemonises the server, which
    inherits any pipe we hand it and holds it open for its whole lifetime —
    spawnSync then waits for a stream that never closes and appears to hang.
    Postgres writes to -l anyway, so nothing is lost.
  */
  const result = spawnSync(
    path.join(binDir, "pg_ctl.exe"),
    ["-D", dataDir, "-l", logFile, "-o", `-p ${PORT} -h ${HOST}`, "-w", "start"],
    { stdio: "ignore" }
  );

  if (result.status !== 0) {
    const tail = existsSync(logFile)
      ? readFileSync(logFile, "utf8").split("\n").slice(-20).join("\n")
      : "";
    if (/already running/i.test(tail)) {
      console.log(`\n  Already running.\n  ${DEV_DATABASE_URL}\n`);
      return;
    }
    console.error(`\n  pg_ctl start failed:\n${tail}\n`);
    process.exit(1);
  }

  console.log(
    `\n  Dev Postgres is up.\n\n` +
      `  Put this in .env.development.local so it wins over .env.local:\n\n` +
      `    DATABASE_URL=${DEV_DATABASE_URL}\n\n` +
      `  Then:  npm run db:migrate   (build the schema)\n` +
      `         npm run db:bootstrap -- --email you@example.com --name "You"\n` +
      `         npm run dev\n`
  );
}

function stop() {
  if (!existsSync(dataDir)) {
    console.log("\n  Nothing to stop — no .dev-postgres/ directory.\n");
    return;
  }
  const result = spawnSync(
    path.join(binDir, "pg_ctl.exe"),
    ["-D", dataDir, "-m", "fast", "stop"],
    { encoding: "utf8" }
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
}

const command = process.argv[2];
if (command === "start") start();
else if (command === "stop") stop();
else {
  console.error("\n  Usage: node scripts/dev-db.mjs <start|stop>\n");
  process.exit(1);
}

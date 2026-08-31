/**
 * APPLY PENDING MIGRATIONS AS PART OF A PRODUCTION DEPLOY.
 *
 *   npm run db:deploy        (runs ahead of `next build`)
 *
 * WHY THIS IS NOT `npm run db:migrate` IN THE BUILD COMMAND
 *
 * DATABASE_URL is set for Preview as well as Production, and both point at the
 * same Supabase project — there is one database. A bare migrate in the build
 * command would therefore let a build from ANY branch migrate production, so a
 * half-finished migration on a feature branch would land the moment someone
 * opened a preview. That is a worse failure than the one automation is meant
 * to solve, and it is silent.
 *
 * So this refuses to run anywhere but a production deploy, and says which it
 * is doing.
 *
 * WHY BUILD TIME RATHER THAN RUNTIME
 *
 * Migrating on a cold start means every concurrent lambda racing to apply the
 * same DDL, and a slow migration turning into request timeouts for whoever
 * happens to be first. Build time is one process, once, with the deploy
 * gated on its success: if the schema cannot be applied, the code that needs
 * it never goes live.
 *
 * The window this opens — schema ahead of code for the length of a build — is
 * safe here because every migration in this project is ADDITIVE. Nothing is
 * dropped or renamed, so the running version simply does not use the new
 * column yet. A destructive migration would need the usual two-step dance and
 * should not be automated at all.
 *
 * The manual control in the admin area stays. It is the fallback for a
 * database that was unreachable during a deploy, and the only place that shows
 * what is applied and what is pending.
 */
import { spawnSync } from "node:child_process";

const isVercel = Boolean(process.env.VERCEL);
const target = process.env.VERCEL_ENV ?? (isVercel ? "unknown" : "local");
const hasUrl = Boolean((process.env.DATABASE_URL ?? "").trim());

const skip = (why) => {
  console.log(`\n  db:deploy — skipped (${why}).\n`);
  process.exit(0);
};

if (isVercel && target !== "production") skip(`${target} deploy, not production`);
if (!isVercel && process.env.DB_DEPLOY !== "1") {
  skip("not a Vercel build; set DB_DEPLOY=1 to force");
}
if (!hasUrl) {
  /*
    A build with no database configured is a legitimate first deploy — the
    variable is often added afterwards. Failing here would make the very first
    deploy impossible, and the app already degrades honestly without one.
  */
  skip("DATABASE_URL is not set");
}

console.log(`\n  db:deploy — applying pending migrations to ${target}.\n`);

const run = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
  stdio: "inherit",
  env: process.env,
});

if (run.status !== 0) {
  console.error(
    "\n  Migrations failed, so this deploy is being stopped.\n" +
      "  The currently live version is untouched and still serving.\n"
  );
  process.exit(run.status ?? 1);
}

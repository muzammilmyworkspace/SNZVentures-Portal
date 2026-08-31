import postgres from "postgres";
import { MIGRATIONS, type Migration } from "./schema-sql.generated";

/**
 * APPLYING THE SCHEMA FROM INSIDE THE APP.
 * ---------------------------------------------------------------------------
 * `npm run db:migrate` is still the normal route. This is the same logic,
 * reachable by a super admin from the admin area, for the situation that kept
 * happening: the person who can reach the database is not the person with a
 * clone, a shell and the connection string. The schema then stays unapplied,
 * and every feature that depends on it fails with `relation … does not exist`
 * — a config problem wearing the costume of a bug, for days.
 *
 * IT IS THE SAME LEDGER. Checksums are computed exactly as migrate.mjs
 * computes them, and applied migrations are recorded in `schema_migrations`,
 * so a migration applied here is indistinguishable from one applied by the CLI
 * and neither route re-runs the other's work.
 *
 * SAFETY
 *   • Each migration runs in its own transaction — a failure leaves nothing
 *     half-applied, and later migrations do not run.
 *   • A migration whose checksum no longer matches the recorded one is a
 *     REFUSAL, not a re-apply: editing an applied migration means the database
 *     and the repository disagree about history, and quietly running the new
 *     text over an old database is how that becomes permanent.
 *   • Its own short-lived connection, not the request pool: DDL should not
 *     borrow a connection the rest of the app is queueing on.
 */

export type MigrationState = {
  name: string;
  checksum: string;
  status: "applied" | "pending" | "changed";
  appliedAt: string | null;
};

export type SchemaStatus = {
  configured: boolean;
  /** False when we could not reach the database at all. */
  reachable: boolean;
  error: string | null;
  migrations: MigrationState[];
  pending: number;
  changed: number;
};

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return postgres(url, {
    max: 1,
    ssl: url.includes("sslmode=disable") ? false : "require",
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
    onnotice: () => {},
  });
}

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

/** What is applied, what is pending, what has been edited since. */
export async function schemaStatus(): Promise<SchemaStatus> {
  const empty = (error: string | null, reachable: boolean): SchemaStatus => ({
    configured: Boolean(process.env.DATABASE_URL),
    reachable,
    error,
    migrations: MIGRATIONS.map((m) => ({
      name: m.name,
      checksum: m.checksum,
      status: "pending" as const,
      appliedAt: null,
    })),
    pending: MIGRATIONS.length,
    changed: 0,
  });

  const sql = connect();
  if (!sql) return empty("DATABASE_URL is not set on this deployment.", false);

  try {
    await sql.unsafe(LEDGER);
    const rows = await sql`SELECT name, checksum, applied_at FROM schema_migrations`;
    const applied = new Map(
      rows.map((r) => [
        String(r.name),
        { checksum: String(r.checksum), at: r.applied_at as Date | null },
      ])
    );

    const migrations: MigrationState[] = MIGRATIONS.map((m) => {
      const row = applied.get(m.name);
      if (!row) {
        return { name: m.name, checksum: m.checksum, status: "pending", appliedAt: null };
      }
      return {
        name: m.name,
        checksum: m.checksum,
        status: row.checksum === m.checksum ? "applied" : "changed",
        appliedAt: row.at ? new Date(row.at).toISOString() : null,
      };
    });

    return {
      configured: true,
      reachable: true,
      error: null,
      migrations,
      pending: migrations.filter((m) => m.status === "pending").length,
      changed: migrations.filter((m) => m.status === "changed").length,
    };
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error), false);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

export type ApplyResult = {
  ok: boolean;
  applied: string[];
  /** The migration that failed, if one did. */
  failedAt: string | null;
  error: string | null;
};

/** Apply every pending migration, in filename order, each in a transaction. */
export async function applyPending(): Promise<ApplyResult> {
  const sql = connect();
  if (!sql) {
    return {
      ok: false,
      applied: [],
      failedAt: null,
      error: "DATABASE_URL is not set on this deployment.",
    };
  }

  const applied: string[] = [];
  try {
    await sql.unsafe(LEDGER);
    const rows = await sql`SELECT name, checksum FROM schema_migrations`;
    const seen = new Map(rows.map((r) => [String(r.name), String(r.checksum)]));

    for (const m of MIGRATIONS as Migration[]) {
      const recorded = seen.get(m.name);
      if (recorded !== undefined) {
        if (recorded !== m.checksum) {
          return {
            ok: false,
            applied,
            failedAt: m.name,
            error:
              `${m.name} has changed since it was applied. ` +
              "An applied migration must never be edited — add a new one instead. " +
              "Nothing was changed.",
          };
        }
        continue;
      }

      await sql.begin(async (tx) => {
        await tx.unsafe(m.sql);
        await tx`INSERT INTO schema_migrations (name, checksum) VALUES (${m.name}, ${m.checksum})`;
      });
      applied.push(m.name);
    }

    return { ok: true, applied, failedAt: null, error: null };
  } catch (error) {
    return {
      ok: false,
      applied,
      failedAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await sql.end({ timeout: 10 }).catch(() => {});
  }
}

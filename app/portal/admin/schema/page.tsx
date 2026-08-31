import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { schemaStatus } from "@/lib/db/migrator";
import { storageDiagnosis } from "@/lib/storage";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { SchemaPanel } from "@/components/portal/SchemaPanel";

export const metadata: Metadata = { title: "Database & storage" };
export const dynamic = "force-dynamic";

/**
 * DATABASE & STORAGE HEALTH.
 *
 * This page exists because of a specific failure that cost days: the schema
 * had never been applied to production, and the only symptoms a person could
 * see were a red box saying "we couldn't record that just now" and, for anyone
 * who knew to look, a stack trace in a log stream. Neither says "a migration
 * is pending", and neither can be acted on by the person who can act on it.
 *
 * Configuration faults should be visible to the people who can fix them, in
 * the product, in words that name the variable.
 */
export default async function SchemaPage() {
  await requireSuperAdmin();

  const [schema, storage] = await Promise.all([
    schemaStatus(),
    Promise.resolve(storageDiagnosis()),
  ]);

  const transportLabel: Record<string, string> = {
    supabase: "Supabase Storage",
    blob: "Vercel Blob",
    s3: "S3-compatible",
    none: "None — uploads are refused",
  };

  return (
    <>
      <PortalHeading
        title="Database & storage"
        lead="What this deployment is actually connected to, and what is waiting to be applied."
      />

      <div className="space-y-6">
        <Panel title="Schema">
          <p className="mb-5 text-[0.9rem] leading-relaxed text-muted">
            Migrations ship with the app. Applying them here is the same
            operation as <code className="text-fg">npm run db:migrate</code>,
            written to the same ledger — so the two never disagree about what
            has run.
          </p>
          <SchemaPanel initial={schema} />
        </Panel>

        <Panel title="Document storage">
          <div className="space-y-4">
            <p className="text-[0.9rem] text-muted">
              Active transport:{" "}
              <strong className="text-fg">
                {transportLabel[storage.active] ?? storage.active}
              </strong>
            </p>

            {storage.active === "none" && (
              <p className="rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 p-4 text-[0.88rem] leading-relaxed text-red-200">
                No usable storage is configured, so uploads are refused rather
                than accepted and lost.
              </p>
            )}

            {storage.notes.length > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-line p-4">
                <p className="mb-2 text-[0.82rem] font-semibold uppercase tracking-wide text-faint">
                  Configured but not usable
                </p>
                <ul className="space-y-2">
                  {storage.notes.map((note) => (
                    <li
                      key={note}
                      className="text-[0.86rem] leading-relaxed text-muted"
                    >
                      {note}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.82rem] leading-relaxed text-faint">
                  Uploads still work — they fall through to the next usable
                  transport. This is listed so a credential that was meant to be
                  in use does not sit broken and unnoticed.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

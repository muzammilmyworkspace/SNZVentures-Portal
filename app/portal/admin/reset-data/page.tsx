import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { resetCounts } from "@/lib/db/repos/reset";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { ResetDataForm } from "@/components/portal/ResetDataForm";

export const metadata: Metadata = { title: "Reset data", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Super admin: delete every student and consultant (and their files) to start clean. */
export default async function ResetDataPage() {
  await requireSuperAdmin();
  const c = await resetCounts();
  const rows: [string, number][] = [
    ["Students (and job seeker / business accounts)", c.students],
    ["Consultants and consultant applicants", c.consultants],
    ["Applications", c.applications],
    ["Uploaded documents and receipts", c.documents],
    ["Fee submissions", c.fees],
  ];
  return (
    <>
      <PortalHeading
        eyebrow="Account"
        title="Reset data"
        lead="Delete every student and consultant account and everything they own. This cannot be undone."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Will be deleted">
          <dl className="space-y-2.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 text-[0.9rem]">
                <dt className="text-muted">{k}</dt>
                <dd className="num font-semibold text-fg-strong">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
            Kept: the Super Admin, employees and sales agents, settings, forms and templates, and finance records and
            invoices (they stay in the books without the deleted person&apos;s name).
          </p>
        </Panel>
        <Panel title="Confirm">
          <ResetDataForm total={c.students + c.consultants} />
        </Panel>
      </div>
    </>
  );
}

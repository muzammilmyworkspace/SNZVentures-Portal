import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { retryUnsyncedSales } from "@/lib/integrations/crm";
import { requireUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/portal/roles";
import { isDatabaseConfigured, db, safeQuery } from "@/lib/db/client";
import { studentsOf } from "@/lib/db/repos/sales";
import { PLAN_LABEL, type PlanKey } from "@/lib/portal/payment-plan";
import { PortalHeading, Panel, EmptyState, StatCard, DataTable, Row, Cell } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { SalesInvite, HandOverButton } from "@/components/portal/SalesActions";
import { SalesTrack } from "@/components/portal/SalesTrack";

export const metadata: Metadata = { title: "My students", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A SALES AGENT'S HOME: the students they brought and where each stands.
 *
 *   registered        signed up, has not sent the initial-fee receipt yet
 *   fee_submitted     receipt with the Super Admin
 *   fee_verified      paid: the sale counted in the CRM; can be handed over
 *   handed over       the Super Admin has the case; the agent keeps this view
 *
 * Read-only apart from adding a student and the hand-over. Scoped in SQL to
 * this agent (users.sales_agent_id), see lib/db/repos/sales.ts.
 */



const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function SalesPage() {
  const { session } = await requireUser("/portal/sales");
  if (session.role !== "sales") redirect(homeFor(session.role));

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Sales team" title="My students" />
        <NotConfigured />
      </>
    );
  }

  const [{ students, invites }, code] = await Promise.all([
    studentsOf(session.userId),
    safeQuery(async () => {
      const [r] = await db()`SELECT crm_code FROM users WHERE id = ${session.userId}`;
      return r?.crm_code ? String(r.crm_code) : null;
    }, null as string | null),
  ]);
  // Any verified sale the CRM missed earlier is re-sent in the background.
  after(() => retryUnsyncedSales());
  const paid = students.filter((s) => s.fee === "verified").length;
  const applied = students.filter((s) => s.application === "submitted").length;
  const signed = students.filter((s) => s.consent).length;
  // Back to the CRM, where the agent works their leads.
  const crmUrl = (process.env.CRM_URL || "https://crm.admitsfair.com").replace(/\/+$/, "");

  return (
    <>
      <PortalHeading
        eyebrow={`Sales team${code ? ` · Agent ID ${code}` : ""}`}
        title="My students"
        lead="Add a student with their name and email: they get a sign-up link and do the rest themselves. Follow each one here; your sale counts in the CRM as soon as their fee is verified."
        action={
          <a href={`${crmUrl}/leads`} className="pv4-btn">
            <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3 w-3">
              <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to CRM
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My students" value={students.length} hint={`${invites.length} link${invites.length === 1 ? "" : "s"} not used yet`} />
        <StatCard label="Fee verified (sales)" value={paid} hint="Counted in the CRM" />
        <StatCard label="Applications submitted" value={applied} />
        <StatCard label="Consent signed" value={signed} />
      </div>

      <div className="mt-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Add a student">
            <SalesInvite />
          </Panel>
          <Panel title="Links not used yet">
            {invites.length === 0 ? (
              <p className="text-[0.88rem] text-muted">Every link you sent has been used.</p>
            ) : (
              <ul className="space-y-3">
                {invites.map((i) => (
                  <li key={i.id} className="text-[0.88rem]">
                    <p className="text-fg">{i.name ?? i.email ?? "Student"}</p>
                    <p className="text-[0.78rem] text-muted">
                      {i.email} · sent {date(i.createdAt)} · expires {date(i.expiresAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Students" padded={false}>
          {students.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="search"
                title="No students yet"
                body="Send a sign-up link from here, or use “Move to portal” on a lead in the CRM. Students appear here once they sign up."
              />
            </div>
          ) : (
            <DataTable columns={["Student", "Progress", ""]} minWidth={860} caption="Your students">
              {students.map((s) => {
                const canHandOver = !s.handedOverAt && s.fee === "verified";
                return (
                  <Row key={s.id}>
                    <Cell>
                      <p className="font-medium text-fg-strong">{s.name}</p>
                      <p className="text-[0.8rem] text-muted">{s.email}</p>
                      <p className="mt-1 text-[0.74rem] text-faint">
                        <span className="font-mono">{s.code}</span> · {s.plan ? PLAN_LABEL[s.plan as PlanKey] : "No plan yet"} · joined {date(s.joinedAt)}
                      </p>
                    </Cell>
                    <Cell>
                      <SalesTrack s={s} />
                      {s.feeAmount && <p className="mt-1.5 text-[0.75rem] text-faint">Fee paid: {s.feeAmount}</p>}
                    </Cell>
                    <Cell className="text-right">
                      {s.handedOverAt ? (
                        <span className="text-[0.8rem] text-muted">With Super Admin since {date(s.handedOverAt)}</span>
                      ) : canHandOver ? (
                        <HandOverButton studentId={s.id} name={s.name} />
                      ) : null}
                    </Cell>
                  </Row>
                );
              })}
            </DataTable>
          )}
        </Panel>

      </div>
    </>
  );
}

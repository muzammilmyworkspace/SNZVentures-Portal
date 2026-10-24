import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { retryUnsyncedSales } from "@/lib/integrations/crm";
import { requireUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/portal/roles";
import { isDatabaseConfigured, db, safeQuery } from "@/lib/db/client";
import { studentsOf, type SalesStudentStage } from "@/lib/db/repos/sales";
import { PLAN_LABEL, type PlanKey } from "@/lib/portal/payment-plan";
import { PortalHeading, Panel, EmptyState, StatCard, DataTable, Row, Cell, StatusPill } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { SalesInvite, HandOverButton } from "@/components/portal/SalesActions";

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

const STAGE: Record<SalesStudentStage, { label: string; tone: string }> = {
  registered: { label: "Registered — fee not sent", tone: "action_required" },
  fee_submitted: { label: "Receipt being checked", tone: "under_review" },
  fee_rejected: { label: "Receipt returned", tone: "needs_update" },
  fee_verified: { label: "Fee verified — sale counted", tone: "approved" },
  application_submitted: { label: "Application submitted", tone: "completed" },
};

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
  const paid = students.filter((s) => s.stage === "fee_verified" || s.stage === "application_submitted").length;
  const waiting = students.filter((s) => s.stage === "fee_submitted").length;

  return (
    <>
      <PortalHeading
        eyebrow={`Sales team${code ? ` · Agent ID ${code}` : ""}`}
        title="My students"
        lead="Students who signed up through your link. Your sale counts in the CRM as soon as a student's initial fee is verified; then hand the case to the Super Admin."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={students.length} />
        <StatCard label="Fee verified (sales)" value={paid} />
        <StatCard label="Receipts being checked" value={waiting} />
        <StatCard label="Links not used yet" value={invites.length} />
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
            <DataTable columns={["Student", "ID", "Plan", "Status", "Joined", ""]} minWidth={760} caption="Your students">
              {students.map((s) => {
                const stage = STAGE[s.stage];
                const canHandOver = !s.handedOverAt && (s.stage === "fee_verified" || s.stage === "application_submitted");
                return (
                  <Row key={s.id}>
                    <Cell>
                      <p className="font-medium text-fg-strong">{s.name}</p>
                      <p className="text-[0.8rem] text-muted">{s.email}</p>
                    </Cell>
                    <Cell muted className="font-mono text-[0.82rem] whitespace-nowrap">
                      {s.code}
                    </Cell>
                    <Cell muted>{s.plan ? PLAN_LABEL[s.plan as PlanKey] : "—"}</Cell>
                    <Cell>
                      <StatusPill status={stage.tone} label={stage.label} />
                      {s.feeAmount && <p className="mt-1 text-[0.78rem] text-muted">{s.feeAmount}</p>}
                    </Cell>
                    <Cell muted className="whitespace-nowrap">{date(s.joinedAt)}</Cell>
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

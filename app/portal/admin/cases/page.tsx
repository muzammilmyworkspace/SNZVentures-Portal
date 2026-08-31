import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth/guard";
import { getAllCases, getCasesForAdvisor } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { CaseStatusControl } from "@/components/portal/CaseStatusControl";

export default async function AdminCasesPage() {
  const { session, role } = await requireStaff();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Cases" />
        <NotConfigured what="Case management" />
      </>
    );
  }

  // Admins see everything; advisors see only what is assigned to them — scoped in SQL.
  const cases = isAdmin(role)
    ? await getAllCases(200)
    : await getCasesForAdvisor(session.userId);

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Cases"
        lead={isAdmin(role) ? "Every open and closed case." : "Cases assigned to you."}
      />
      <Panel padded={cases.length === 0}>
        {cases.length === 0 ? (
          <EmptyState icon="file" title="No cases" body="Cases appear here once opened for a client." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Cases</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Client", "Case", "Pathway", "Status", "Advisor", "Updated"].map((h) => (
                    <th key={h} scope="col" className="label px-5 py-3 text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-[0.9rem] text-fg">{c.clientName}</td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">{c.title}</td>
                    <td className="px-5 py-3"><span className="label text-faint">{c.pathway}</span></td>
                    <td className="px-5 py-3">
                      <StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">{c.advisorName ?? "—"}</td>
                    <td className="px-5 py-3 text-[0.8rem] text-faint">
                      {new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-5 text-[0.8rem] text-faint">
        Clients cannot change case status. Only staff may advance a case, and every change is recorded in the{" "}
        <Link href="/portal/admin/audit" className="text-accent underline underline-offset-4">audit log</Link>.
      </p>

      {cases.length > 0 && (
        <div className="mt-5">
          <Panel title="Update a case">
            {/*
              Below the table rather than inside it. A table is for scanning;
              putting a select and a text field in every row turns forty cases
              into a wall of controls and makes the overview unreadable.
            */}
            {cases.slice(0, 25).map((c) => (
              <CaseStatusControl
                key={c.id}
                caseId={c.id}
                current={c.status}
                title={`${c.clientName} — ${c.title}`}
              />
            ))}
            {cases.length > 25 && (
              <p className="mt-4 text-[0.8rem] text-faint">
                Showing the 25 most recently updated. Older cases are in the
                table above.
              </p>
            )}
          </Panel>
        </div>
      )}

    </>
  );
}

import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth/guard";
import { getAllCases, getCasesForAdvisor } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { CaseStatusControl } from "@/components/portal/CaseStatusControl";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
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
  const pg = paginate(cases, pageFrom(sp.page));

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Cases"
        /*
          Named against the other page. An admin comparing this count with the
          one on Your Students was comparing every case in the firm with their
          own book, and read the difference as data going missing.
        */
        lead={
          isAdmin(role)
            ? "Every open and closed case in the firm — not only your own. Your own book is on Your Students."
            : "Every case of yours, including clients with more than one."
        }
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
                  {["Reference", "Client", "Case", "Pathway", "Status", "Consultant", "Updated"].map((h) => (
                    <th key={h} scope="col" className="label px-5 py-3 text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    {/* Generated for every case since 003 and, until now, shown
                        nowhere — which made it useless for naming a case in an
                        email instead of reading out a UUID. */}
                    <td className="px-5 py-3">
                      <span className="num text-[0.8rem] text-faint">{c.reference ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3 text-[0.9rem] text-fg">
                      {c.clientName}
                      {c.country && (
                        <span className="mt-0.5 block text-[0.78rem] text-faint">{c.country}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">
                      {c.title}
                      {/* What the case is waiting for. Written at creation and
                          never displayed, so the queue said what each case WAS
                          but not what to do about it. */}
                      {c.nextAction && (
                        <span className="mt-0.5 block text-[0.78rem] text-faint">{c.nextAction}</span>
                      )}
                    </td>
                    <td className="px-5 py-3"><span className="label text-faint">{c.pathway}</span></td>
                    <td className="px-5 py-3">
                      <StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />
                    </td>
                    {/*
                      The advisor ON THE CASE if one was assigned, otherwise the
                      client's consultant. Reading only the first showed "—"
                      against every case, including students who plainly had
                      somebody — the two are different facts and nothing sets
                      the case one when a consultant enrols a student.
                    */}
                    <td className="px-5 py-3 text-[0.85rem]">
                      {c.advisorName ? (
                        <span className="text-muted">{c.advisorName}</span>
                      ) : c.consultantName ? (
                        <span className="text-muted">
                          {c.consultantName}
                          <span className="mt-0.5 block text-[0.72rem] text-faint">
                            via their consultant
                          </span>
                        </span>
                      ) : (
                        <span className="text-faint">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[0.8rem] text-faint">
                      {new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={pg.page} pages={pg.pages} total={pg.total} basePath="/portal/admin/cases" params={sp} noun="cases" />
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

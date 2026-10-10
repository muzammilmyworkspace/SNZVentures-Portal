import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { listUniversities, listCommissions, allRates, studentsForPicker } from "@/lib/db/repos/finance";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, MiniStat } from "@/components/portal/FinanceParts";
import { CommissionForm, CommissionActions, DeleteUniversity, ModalButton } from "@/components/portal/FinanceForms";
import { eur, money, shortDate, sumEur, thisMonth } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "University commissions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * UNIVERSITY COMMISSIONS — the students sent to commission-paying
 * universities and what each university still owes. Add a student; mark it
 * received when the money arrives (it then counts as income).
 */
export default async function UniversityCommissionsPage({ searchParams }: { searchParams: Promise<{ show?: string; u?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const show = sp.show === "received" ? "received" : sp.show === "expected" ? "expected" : "all";
  const [universities, commissions, rates, students] = await Promise.all([listUniversities(), listCommissions(), allRates(), studentsForPicker()]);
  const today = new Date().toISOString().slice(0, 10);
  const dated = commissions.map((c) => ({ ...c, date: c.receivedOn ?? c.expectedOn ?? `${thisMonth()}-01` }));
  const expected = sumEur(dated.filter((c) => c.status === "expected"), rates);
  const received = sumEur(dated.filter((c) => c.status === "received"), rates);
  const overdue = dated.filter((c) => c.status === "expected" && c.expectedOn && c.expectedOn < today);
  const rows = dated.filter((c) => (show === "all" || c.status === show) && (!sp.u || c.universityId === sp.u));
  const href = (k: string) => {
    const q = new URLSearchParams();
    if (k !== "all") q.set("show", k);
    if (sp.u) q.set("u", sp.u);
    const s = q.toString();
    return s ? `/portal/admin/finance/universities?${s}` : "/portal/admin/finance/universities";
  };

  return (
    <>
      <FinanceHeader
        title="University commissions"
        lead="Students you sent to universities that pay a commission, and what each still owes. Mark it received when the money arrives."
        path="/portal/admin/finance/universities"
        ym={thisMonth()}
        monthly={false}
      />
      <MissingRates missing={[...new Set([...expected.missing, ...received.missing])]} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Students" value={commissions.length} hint={`At ${universities.length} universities`} />
        <MiniStat label="Still to receive" value={eur(expected.cents)} tone={expected.cents ? "warn" : undefined} />
        <MiniStat label="Overdue" value={overdue.length} hint="Past the date expected" tone={overdue.length ? "warn" : undefined} />
        <MiniStat label="Received in total" value={eur(received.cents)} tone="in" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "expected", "received"] as const).map((k) => (
          <Link
            key={k}
            href={href(k)}
            className={
              show === k
                ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.82rem] font-medium capitalize text-accent"
                : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] capitalize text-muted hover:text-fg"
            }
          >
            {k === "expected" ? "To receive" : k}
          </Link>
        ))}
        {sp.u && (
          <Link href={href(show)} className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-fg">
            {universities.find((u) => u.id === sp.u)?.name ?? "University"} only · show all
          </Link>
        )}
      </div>

      <Panel
        title="Commissions"
        className="mb-6"
        padded={rows.length === 0}
        action={
          <ModalButton label="+ Add student" title="Add a student sent to a university">
            <CommissionForm universities={universities} students={students} />
          </ModalButton>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon="search" title="Nothing here yet" body="Add each student sent to a commission-paying university, with the commission expected. A new university is added as you type it." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Student", "University", "Intake", "Expected by", "Commission", "Status", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "Commission" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const late = c.status === "expected" && c.expectedOn && c.expectedOn < today;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-[0.9rem] font-medium text-fg">{c.studentName}</td>
                      <td className="px-4 py-3 text-[0.88rem]">
                        <Link href={`/portal/admin/finance/universities?u=${c.universityId}`} className="text-fg underline-offset-4 hover:text-accent hover:underline">
                          {c.university}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[0.85rem] text-muted">{c.intake ?? "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-[0.85rem] ${late ? "font-semibold text-danger" : "text-faint"}`}>
                        {c.expectedOn ? shortDate(c.expectedOn) : "—"}
                        {late && " · overdue"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-fg">{money(c.amountCents, c.currency)}</td>
                      <td className="px-4 py-3">
                        {c.status === "received" ? <span className="pill pill-ok">Received {c.receivedOn ? shortDate(c.receivedOn) : ""}</span> : <span className="pill pill-warn">To receive</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CommissionActions id={c.id} status={c.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {universities.length > 0 && (
        <Panel title="By university" padded={false}>
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["University", "Students", "Still to receive", "Received", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "Still to receive" || h === "Received" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {universities.map((u) => {
                  const mine = dated.filter((c) => c.universityId === u.id);
                  const toGet = sumEur(mine.filter((c) => c.status === "expected"), rates).cents;
                  const got = sumEur(mine.filter((c) => c.status === "received"), rates).cents;
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/portal/admin/finance/universities?u=${u.id}`} className="text-[0.9rem] font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
                          {u.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[0.86rem] text-muted">{mine.length}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${toGet ? "font-semibold text-warn" : "text-muted"}`}>{eur(toGet)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{eur(got)}</td>
                      <td className="px-4 py-3 text-right">{mine.every((c) => c.status === "expected") && <DeleteUniversity id={u.id} name={u.name} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

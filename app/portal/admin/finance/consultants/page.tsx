import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { materializePayouts, consultantsForFinance, listPayouts, allRates, studentsForPicker } from "@/lib/db/repos/finance";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, MiniStat } from "@/components/portal/FinanceParts";
import { TermsForm, PayoutForm, PayoutActions, ModalButton } from "@/components/portal/FinanceForms";
import { eur, money, shortDate, sumEur, thisMonth } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Consultant referrals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * CONSULTANT REFERRALS — the students each consultant brought, and what SnZ
 * owes them for it. Add a referral by hand, or set a consultant's share once
 * (Share rules) and it is added by itself whenever their student's fee is
 * verified. "Mark paid" moves it into Expenses.
 */
export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ show?: string; c?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const show = sp.show === "paid" ? "paid" : sp.show === "owed" ? "owed" : "all";
  await materializePayouts();
  const [consultants, payouts, rates, students] = await Promise.all([consultantsForFinance(), listPayouts(), allRates(), studentsForPicker()]);
  const dated = payouts.map((p) => ({ ...p, date: p.paidOn ?? p.createdOn }));
  const owed = sumEur(dated.filter((p) => p.status === "owed"), rates);
  const paidMonth = sumEur(dated.filter((p) => p.status === "paid" && (p.paidOn ?? "").startsWith(thisMonth())), rates);
  const paidAll = sumEur(dated.filter((p) => p.status === "paid"), rates);
  const rows = dated.filter((p) => (show === "all" || p.status === show) && (!sp.c || p.consultantId === sp.c));
  const href = (k: string) => {
    const q = new URLSearchParams();
    if (k !== "all") q.set("show", k);
    if (sp.c) q.set("c", sp.c);
    const s = q.toString();
    return s ? `/portal/admin/finance/consultants?${s}` : "/portal/admin/finance/consultants";
  };

  return (
    <>
      <FinanceHeader
        title="Consultant referrals"
        lead="The students each consultant referred and what they are owed for it. Add a referral, then mark it paid when you pay the consultant."
        path="/portal/admin/finance/consultants"
        ym={thisMonth()}
        monthly={false}
      />
      <MissingRates missing={[...new Set([...owed.missing, ...paidAll.missing])]} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total referrals" value={payouts.length} hint={`From ${new Set(payouts.map((p) => p.consultantId)).size} consultants`} />
        <MiniStat label="To pay consultants" value={eur(owed.cents)} hint={`${dated.filter((p) => p.status === "owed").length} not paid yet`} tone={owed.cents ? "warn" : undefined} />
        <MiniStat label="Paid this month" value={eur(paidMonth.cents)} />
        <MiniStat label="Paid in total" value={eur(paidAll.cents)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "owed", "paid"] as const).map((k) => (
          <Link
            key={k}
            href={href(k)}
            className={
              show === k
                ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.82rem] font-medium capitalize text-accent"
                : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] capitalize text-muted hover:text-fg"
            }
          >
            {k === "owed" ? "To pay" : k}
          </Link>
        ))}
        {sp.c && (
          <Link href={href(show)} className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-fg">
            {consultants.find((c) => c.id === sp.c)?.name ?? "Consultant"} only · show all
          </Link>
        )}
      </div>

      <Panel
        title="Referrals"
        padded={rows.length === 0}
        action={
          <span className="flex flex-wrap gap-2">
            <ModalButton label="Share rules" title="Each consultant's share of a verified fee" variant="ghost" wide>
              <p className="mb-4 text-[0.85rem] text-muted">
                Optional. Set a consultant&apos;s share once, and a referral is added by itself whenever a fee of their student is verified.
              </p>
              {consultants.length === 0 ? (
                <p className="text-[0.88rem] text-muted">No consultants yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {consultants.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span>
                        <span className="block text-[0.9rem] font-medium text-fg">{c.name}</span>
                        <span className="block text-[0.74rem] text-faint">{c.students} students</span>
                      </span>
                      <TermsForm consultantId={c.id} current={c.terms} />
                    </li>
                  ))}
                </ul>
              )}
            </ModalButton>
            <ModalButton label="+ Add referral" title="Add a referral">
              <PayoutForm consultants={consultants.map((c) => ({ id: c.id, name: c.name }))} students={students} />
            </ModalButton>
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon="search" title="No referrals yet" body="Use Add referral for each student a consultant brought, with what you owe them." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Date", "Student", "Referred by", "What for", "To pay", "Status", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "To pay" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[0.82rem] text-faint">{shortDate(p.createdOn)}</td>
                    <td className="px-4 py-3 text-[0.9rem] font-medium text-fg">{p.studentName ?? "—"}</td>
                    <td className="px-4 py-3 text-[0.88rem]">
                      <Link href={`/portal/admin/finance/consultants?c=${p.consultantId}`} className="text-fg underline-offset-4 hover:text-accent hover:underline">
                        {p.consultantName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[0.84rem] text-muted">
                      {p.description}
                      {p.automatic && <span className="pill pill-info ml-2">Automatic</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-fg">{money(p.amountCents, p.currency)}</td>
                    <td className="px-4 py-3">
                      {p.status === "owed" ? <span className="pill pill-warn">To pay</span> : <span className="pill pill-ok">Paid {p.paidOn ? shortDate(p.paidOn) : ""}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PayoutActions id={p.id} status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

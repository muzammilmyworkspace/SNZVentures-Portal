import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { materializePayouts, consultantsForFinance, listPayouts, allRates, studentsByConsultant } from "@/lib/db/repos/finance";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, MiniStat } from "@/components/portal/FinanceParts";
import { ReferralForm, RemoveRule, PayoutActions, ModalButton } from "@/components/portal/FinanceForms";
import { eur, money, shortDate, sumEur, thisMonth, monthName } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Referrals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * REFERRALS — what SnZ owes the people who send students: its consultants
 * (on the portal) and anyone else (a referral). Add one with its share rule;
 * a consultant can keep that rule, and each verified fee of their students
 * then adds a referral by itself. "Mark paid" moves it into Expenses.
 * SHARE RULES & END OF MONTH lists everyone, their rule and what to pay.
 */
export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ show?: string; who?: string; c?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const show = sp.show === "paid" ? "paid" : sp.show === "owed" ? "owed" : "all";
  const who = sp.who === "consultant" || sp.who === "referral" ? sp.who : "all";
  await materializePayouts();
  const [consultants, payouts, rates, studentsOf] = await Promise.all([consultantsForFinance(), listPayouts(), allRates(), studentsByConsultant()]);
  const now = thisMonth();
  const dated = payouts.map((p) => ({ ...p, date: p.paidOn ?? p.createdOn }));
  const owed = sumEur(dated.filter((p) => p.status === "owed"), rates);
  const paidMonth = sumEur(dated.filter((p) => p.status === "paid" && (p.paidOn ?? "").startsWith(now)), rates);
  const paidAll = sumEur(dated.filter((p) => p.status === "paid"), rates);
  const rows = dated.filter(
    (p) => (show === "all" || p.status === show) && (who === "all" || p.referrerKind === who) && (!sp.c || p.consultantName === sp.c)
  );
  const href = (o: { show?: string; who?: string; c?: string | null }) => {
    const q = new URLSearchParams();
    const s2 = o.show ?? show;
    const w2 = o.who ?? who;
    const c2 = o.c === null ? undefined : o.c ?? sp.c;
    if (s2 !== "all") q.set("show", s2);
    if (w2 !== "all") q.set("who", w2);
    if (c2) q.set("c", c2);
    const s = q.toString();
    return s ? `/portal/admin/finance/consultants?${s}` : "/portal/admin/finance/consultants";
  };

  // SHARE RULES & END OF MONTH: one line per person who refers students.
  type Person = {
    name: string;
    kind: "consultant" | "referral";
    consultantId: string | null;
    rule: string;
    count: number;
    owed: typeof dated;
    paidMonth: typeof dated;
  };
  const people = new Map<string, Person>();
  const ruleText = (k: "percent" | "fixed" | null, v: number | null, cur: string) =>
    k == null || v == null ? "Amount set by hand" : k === "percent" ? `${v}% of the amount` : `${money(Math.round(v * 100), cur)} each`;
  for (const c of consultants) {
    people.set(`c:${c.id}`, {
      name: c.name,
      kind: "consultant",
      consultantId: c.id,
      rule: c.terms ? `${ruleText(c.terms.kind, c.terms.value, c.terms.currency)} · automatic` : "No standing rule",
      count: 0,
      owed: [],
      paidMonth: [],
    });
  }
  for (const p of dated) {
    const key = p.consultantId ? `c:${p.consultantId}` : `r:${p.consultantName.toLowerCase()}`;
    const cur: Person = people.get(key) ?? {
      name: p.consultantName,
      kind: p.referrerKind,
      consultantId: p.consultantId,
      rule: ruleText(p.ruleKind, p.ruleValue, p.currency),
      count: 0,
      owed: [],
      paidMonth: [],
    };
    // A consultant without a standing rule shows the rule of their latest referral.
    if (cur.rule === "No standing rule" && p.ruleKind) cur.rule = ruleText(p.ruleKind, p.ruleValue, p.currency);
    cur.count += 1;
    if (p.status === "owed") cur.owed.push(p);
    if (p.status === "paid" && (p.paidOn ?? "").startsWith(now)) cur.paidMonth.push(p);
    people.set(key, cur);
  }
  const ledger = [...people.values()]
    .filter((x) => x.count > 0 || x.rule !== "No standing rule")
    .map((x) => ({ ...x, owedEur: sumEur(x.owed, rates).cents, paidEur: sumEur(x.paidMonth, rates).cents }))
    .sort((a, b) => b.owedEur - a.owedEur || a.name.localeCompare(b.name));
  const termsOf = (id: string | null) => consultants.find((c) => c.id === id)?.terms ?? null;

  const chip = (on: boolean) =>
    on
      ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.82rem] font-medium text-accent"
      : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-muted hover:text-fg";

  return (
    <>
      <FinanceHeader
        title="Referrals"
        lead="What you owe the people who send you students: your consultants, and anyone else who referred one. Add a referral with its share rule, then mark it paid at the end of the month."
        path="/portal/admin/finance/consultants"
        ym={now}
        monthly={false}
      />
      <MissingRates missing={[...new Set([...owed.missing, ...paidAll.missing])]} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="Total referrals"
          value={payouts.length}
          hint={`${payouts.filter((p) => p.referrerKind === "consultant").length} by consultants · ${payouts.filter((p) => p.referrerKind === "referral").length} other referrals`}
        />
        <MiniStat label="To pay" value={eur(owed.cents)} hint={`${dated.filter((p) => p.status === "owed").length} not paid yet`} tone={owed.cents ? "warn" : undefined} />
        <MiniStat label={`Paid · ${monthName(now)}`} value={eur(paidMonth.cents)} />
        <MiniStat label="Paid in total" value={eur(paidAll.cents)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "owed", "paid"] as const).map((k) => (
          <Link key={k} href={href({ show: k })} className={`${chip(show === k)} capitalize`}>
            {k === "owed" ? "To pay" : k}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden />
        {(["all", "consultant", "referral"] as const).map((k) => (
          <Link key={k} href={href({ who: k })} className={chip(who === k)}>
            {k === "all" ? "Everyone" : k === "consultant" ? "Consultants" : "Referrals"}
          </Link>
        ))}
        {sp.c && (
          <Link href={href({ c: null })} className="text-[0.82rem] text-muted underline underline-offset-4 hover:text-fg">
            {sp.c} only · show all
          </Link>
        )}
      </div>

      <Panel
        title="Referrals"
        className="mb-6"
        padded={rows.length === 0}
        action={
          <ModalButton label="+ Add referral" title="Add a referral" wide>
            <ReferralForm consultants={consultants.map((c) => ({ id: c.id, name: c.name, terms: c.terms }))} studentsOf={studentsOf} />
          </ModalButton>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon="search" title="No referrals yet" body="Use Add referral for each student someone sent you, with what you owe them." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Date", "Referred by", "Student", "What for", "Rule", "To pay", "Status", ""].map((h, i) => (
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
                    <td className="px-4 py-3 text-[0.88rem]">
                      <Link href={href({ c: p.consultantName })} className="font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
                        {p.consultantName}
                      </Link>
                      <span className={`pill ml-2 ${p.referrerKind === "consultant" ? "pill-info" : "pill-work"}`}>
                        {p.referrerKind === "consultant" ? "Consultant" : "Referral"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.9rem] text-fg">{p.studentName ?? "—"}</td>
                    <td className="px-4 py-3 text-[0.84rem] text-muted">
                      {p.description}
                      {p.automatic && <span className="pill pill-neutral ml-2">Automatic</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[0.8rem] text-muted">
                      {p.ruleKind === "percent" && p.ruleValue != null
                        ? `${p.ruleValue}%${p.baseCents ? ` of ${money(p.baseCents, p.currency)}` : ""}`
                        : p.ruleKind === "fixed"
                          ? "Fixed"
                          : "—"}
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

      <Panel title={`Share rules & end of month · ${eur(owed.cents)} to pay`} padded={ledger.length === 0}>
        {ledger.length === 0 ? (
          <EmptyState icon="search" title="Nobody yet" body="Each consultant and referrer appears here with their share rule and what you owe them, once you add a referral." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Who", "Share rule", "Referrals", "To pay now", `Paid · ${monthName(now)}`, ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "To pay now" || h.startsWith("Paid") ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((x) => (
                  <tr key={`${x.kind}-${x.consultantId ?? x.name}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link href={href({ c: x.name, show: "all" })} className="text-[0.9rem] font-medium text-fg underline-offset-4 hover:text-accent hover:underline">
                        {x.name}
                      </Link>
                      <span className={`pill ml-2 ${x.kind === "consultant" ? "pill-info" : "pill-work"}`}>{x.kind === "consultant" ? "Consultant" : "Referral"}</span>
                    </td>
                    <td className="px-4 py-3 text-[0.84rem] text-muted">{x.rule}</td>
                    <td className="px-4 py-3 text-[0.86rem] text-muted">{x.count}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${x.owedEur ? "text-warn" : "text-muted"}`}>{eur(x.owedEur)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{eur(x.paidEur)}</td>
                    <td className="px-4 py-3 text-right">
                      {x.kind === "consultant" && x.consultantId && termsOf(x.consultantId) && <RemoveRule consultantId={x.consultantId} name={x.name} />}
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

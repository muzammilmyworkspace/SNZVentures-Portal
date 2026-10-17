import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { materializeRecurring, materializePayouts, listTransfers } from "@/lib/db/repos/finance";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MissingRates, MiniStat } from "@/components/portal/FinanceParts";
import { ModalButton, AccountForm, AccountActive, TransferForm, DeleteTransfer } from "@/components/portal/FinanceForms";
import { financialPosition } from "@/lib/portal/finance-position";
import { eur, money, shortDate, thisMonth, monthName } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Balance & accounts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * BALANCE & ACCOUNTS — the balance sheet today and the money accounts.
 *
 * CURRENT ASSETS: each bank and cash account (Business Revolut, Wise
 * Business, Cash, PKR account), receivables, and the input VAT of the
 * month's reverse-charge purchases.
 * LIABILITIES (in process): current (subscriptions and bills unpaid,
 * referral commissions, partner profit shares, output VAT on reverse
 * charge) and non-current (expenses marked long-term).
 * EQUITY: assets less liabilities.
 */
export default async function BalancePage() {
  await requireSuperAdmin();
  const now = thisMonth();
  await materializeRecurring();
  await materializePayouts();
  const [pos, transfers] = await Promise.all([financialPosition(), listTransfers()]);
  const { accounts } = pos;
  const L = pos.liabilities;

  // Reverse charge this month: input VAT (an asset) and output VAT (a liability) of the same amount.
  const rcVat = pos.vatRc.cents;
  const totalAssets = pos.assets;
  const totalLiab = L.total;
  const active = accounts
    .filter((a) => a.account.active)
    .map((a) => ({ id: a.account.id, name: a.account.name, currency: a.account.currency, defaultIn: a.account.defaultIn }));

  const line = (label: string, cents: number, sub?: string, key?: string) => (
    <tr key={key ?? label} className="border-b border-line">
      <td className="py-2.5 pl-8 pr-4 text-[0.88rem] text-fg">
        {label}
        {sub && <span className="block text-[0.72rem] text-faint">{sub}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted">{eur(cents)}</td>
    </tr>
  );
  const group = (label: string) => (
    <tr className="border-b border-line">
      <td colSpan={2} className="px-4 pb-1.5 pt-3.5 text-[0.84rem] font-semibold text-fg">
        {label}
      </td>
    </tr>
  );
  const total = (label: string, cents: number, strong = false) => (
    <tr className={`border-b border-line ${strong ? "bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]" : ""}`}>
      <td className={`px-4 py-2.5 text-[0.88rem] font-semibold ${strong ? "text-fg-strong" : "text-fg"}`}>{label}</td>
      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${cents < 0 ? "text-danger" : strong ? "text-fg-strong" : "text-fg"}`}>{eur(cents)}</td>
    </tr>
  );

  return (
    <>
      <FinanceHeader
        title="Balance & accounts"
        lead="The balance sheet today: what AdmitsFair has (assets), what it owes (liabilities, in process) and what is left (equity), with every bank and cash account."
        path="/portal/admin/finance/balance"
        ym={now}
        monthly={false}
      />
      <MissingRates missing={pos.missing} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total assets" value={eur(totalAssets)} hint={`Cash and bank ${eur(pos.cash)}`} tone="in" />
        <MiniStat label="Total liabilities (in process)" value={eur(totalLiab)} hint={`Current ${eur(L.short)} · non-current ${eur(L.long)}`} tone={totalLiab ? "warn" : undefined} />
        <MiniStat label="Equity" value={eur(pos.equity)} hint="Total assets − total liabilities" tone={pos.equity < 0 ? "warn" : undefined} />
        <MiniStat label={`Reverse-charge VAT · ${monthName(now)}`} value={eur(rcVat)} hint={`Output = input: net €0.00 · ${pos.vatRc.count} purchases`} />
      </div>

      <Panel title="Balance sheet · today" className="mb-6" padded={false}>
        <div className="grid xl:grid-cols-2">
          <table className="w-full text-left xl:border-r xl:border-line">
            <tbody>
              <tr className="border-b border-line">
                <td colSpan={2} className="label px-4 py-3 text-[0.72rem] text-accent">
                  Assets
                </td>
              </tr>
              {group("Current assets · cash and bank")}
              {accounts
                .filter((a) => a.account.active)
                .map((a) => line(a.account.name, a.eur ?? 0, `${a.account.kind === "cash" ? "Cash" : "Bank"} · ${money(a.cents, a.account.currency)}`, a.account.id))}
              {group("Current assets · receivables (to be received)")}
              {line("University commissions", pos.receivable.commissions)}
              {line("Fees awaiting verification", pos.receivable.feesToVerify, `${pos.receivable.feesCount} receipts`)}
              {line("Input VAT 21% (reverse charge)", rcVat, "Deductible on this month's return")}
              {total("Total assets", totalAssets, true)}
            </tbody>
          </table>
          <table className="w-full text-left">
            <tbody>
              <tr className="border-b border-line">
                <td colSpan={2} className="label px-4 py-3 text-[0.72rem] text-accent">
                  Liabilities and equity
                </td>
              </tr>
              {group("Current liabilities (in process, due within a year)")}
              {line("Subscriptions and fixed costs", L.subscriptions, "Months written and not yet paid")}
              {line("Other bills (accounts payable)", L.bills)}
              {line("Referral commissions payable", L.referrals)}
              {line("Partner profit shares payable", L.partners)}
              {line("Output VAT 21% (reverse charge)", rcVat, "To declare on this month's return")}
              {group("Non-current liabilities (due after a year)")}
              {line("Long-term liabilities", L.long)}
              {total("Total liabilities", totalLiab)}
              {group("Equity")}
              {line("Retained earnings (assets − liabilities)", pos.equity)}
              {total("Total liabilities and equity", totalLiab + pos.equity, true)}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Bank and cash accounts"
        className="mb-6"
        padded={accounts.length === 0}
        action={
          <span className="flex flex-wrap gap-2">
            <ModalButton label="Transfer" title="Move money between accounts" variant="ghost">
              <TransferForm accounts={active} />
            </ModalButton>
            <ModalButton label="+ Add account" title="Add a bank or cash account">
              <AccountForm />
            </ModalButton>
          </span>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState icon="search" title="No accounts yet" body="Add Business Revolut, Wise Business, Cash and the PKR account, each with its opening balance." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Account", "Type", "Opening balance", "Balance today", "In EUR", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "Balance today" || h === "In EUR" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map(({ account: a, cents, eur: e }) => (
                  <tr key={a.id} className={`border-b border-line last:border-0 ${a.active ? "" : "opacity-55"}`}>
                    <td className="px-4 py-3 text-[0.92rem] font-medium text-fg">
                      <a href={`/portal/admin/finance/transactions?acc=${a.id}`} className="underline-offset-4 hover:text-accent hover:underline">
                        {a.name}
                      </a>
                      {a.defaultIn && <span className="pill pill-info ml-2">Fees land here</span>}
                      {!a.active && <span className="pill pill-neutral ml-2">Off</span>}
                    </td>
                    <td className="px-4 py-3 text-[0.85rem] text-muted">
                      {a.kind === "cash" ? "Cash" : "Bank"} · {a.currency}
                    </td>
                    <td className="px-4 py-3 text-[0.84rem] text-muted">
                      {money(a.openingCents, a.currency)} <span className="text-faint">on {shortDate(a.openingOn)}</span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${cents < 0 ? "text-danger" : "text-fg"}`}>{money(cents, a.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{e == null ? "no rate" : eur(e)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-start gap-1.5">
                        <ModalButton label="Edit" title={`Edit ${a.name}`} variant="ghost">
                          <AccountForm initial={a} />
                        </ModalButton>
                        <AccountActive id={a.id} name={a.name} active={a.active} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Transfers between accounts" padded={transfers.length === 0}>
        {transfers.length === 0 ? (
          <EmptyState icon="search" title="No transfers yet" body="Money moved between your own accounts (cash to the bank, EUR to PKR). It is neither revenue nor expense." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Date", "Debit (to)", "Credit (from)", "Sent", "Received", "Note", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "Sent" || h === "Received" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[0.82rem] text-faint">{shortDate(t.date)}</td>
                    <td className="px-4 py-3 text-[0.88rem] text-fg">{t.toName}</td>
                    <td className="px-4 py-3 text-[0.88rem] text-fg">{t.fromName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">{money(t.fromCents, t.fromCurrency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">{money(t.toCents, t.toCurrency)}</td>
                    <td className="px-4 py-3 text-[0.84rem] text-muted">{t.note ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <DeleteTransfer id={t.id} />
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

import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { accountBalances } from "@/lib/db/repos/finance";
import { listIntegrations, listBankLines } from "@/lib/db/repos/finance-integrations";
import { Panel, EmptyState } from "@/components/portal/Pieces";
import { FinanceHeader, MiniStat } from "@/components/portal/FinanceParts";
import { ModalButton, AccountForm, AccountActive } from "@/components/portal/FinanceForms";
import { ConnectForm, IntegrationActions, BankLineActions } from "@/components/portal/IntegrationForms";
import { syncStale } from "@/lib/portal/finance-sync";
import { money, shortDate, thisMonth } from "@/lib/portal/finance-view";

export const metadata: Metadata = { title: "Integrations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * INTEGRATIONS — the bank and payment accounts connected to the books, and
 * the place to manage the accounts themselves.
 *
 * Connect Wise Business or Stripe with a read-only key (balances and
 * transactions come in by themselves), or Revolut Business and any other bank
 * by uploading the statement CSV. Each connection shows the provider's
 * balance beside the balance in the books, and the difference. Every
 * statement line is then reconciled: matched to an entry already in the
 * books, added as a new one, recorded as a transfer, or ignored.
 */
const PROVIDERS = [
  { key: "wise", name: "Wise Business", how: "Read-only API token", what: "Balance and transactions update by themselves (statements by CSV where Wise asks for extra approval)." },
  { key: "stripe", name: "Stripe", how: "Read-only restricted key", what: "Payments in, Stripe fees, refunds and payouts to the bank come in by themselves." },
  { key: "revolut", name: "Revolut Business", how: "Statement CSV", what: "Upload the statement; only lines not seen before are added." },
  { key: "csv", name: "Any other bank", how: "Statement CSV", what: "Any bank's CSV with a date, an amount and a description column." },
] as const;

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ show?: string; c?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const show = ["new", "matched", "added", "ignored", "all"].includes(sp.show ?? "") ? (sp.show as string) : "new";
  await syncStale();
  const today = new Date().toISOString().slice(0, 10);
  const [integrations, balances, lines, newLines] = await Promise.all([
    listIntegrations(),
    accountBalances(today),
    listBankLines({ status: show === "all" ? undefined : show, integrationId: sp.c }),
    listBankLines({ status: "new" }),
  ]);
  const accounts = balances.filter((b) => b.account.active).map((b) => ({ id: b.account.id, name: b.account.name, currency: b.account.currency }));
  const booksOf = (id: string | null) => balances.find((b) => b.account.id === id) ?? null;
  const diffs = integrations.filter((i) => {
    const b = booksOf(i.accountId);
    return i.providerBalanceCents != null && b && i.providerCurrency === b.account.currency && i.providerBalanceCents !== b.cents;
  });
  const link = (s: string) => {
    const q = new URLSearchParams();
    if (s !== "new") q.set("show", s);
    if (sp.c) q.set("c", sp.c);
    const t = q.toString();
    return t ? `/portal/admin/finance/integrations?${t}` : "/portal/admin/finance/integrations";
  };
  const chip = (on: boolean) =>
    on
      ? "inline-flex min-h-9 items-center rounded-full border border-moss-400/60 px-3.5 text-[0.82rem] font-medium text-accent"
      : "inline-flex min-h-9 items-center rounded-full border border-line px-3.5 text-[0.82rem] text-muted hover:text-fg";

  return (
    <>
      <FinanceHeader
        title="Integrations"
        lead="Connect Wise, Stripe and your banks to the books, manage the accounts, and reconcile every statement line with what is recorded."
        path="/portal/admin/finance/integrations"
        ym={thisMonth()}
        monthly={false}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Connected" value={integrations.length} hint={`${integrations.filter((i) => i.hasSecret).length} sync by themselves`} />
        <MiniStat label="Lines to review" value={newLines.length} hint="Statement lines not yet in the books" tone={newLines.length ? "warn" : undefined} />
        <MiniStat label="Balances that differ" value={diffs.length} hint="Provider balance ≠ balance in the books" tone={diffs.length ? "warn" : undefined} />
        <MiniStat label="Accounts" value={accounts.length} hint="Bank and cash accounts in the books" />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PROVIDERS.map((p) => (
          <div key={p.key} className="flex flex-col rounded-[14px] border border-line bg-[image:var(--panel-bg)] p-4 shadow-[var(--panel-shadow)]">
            <span className="text-[1rem] font-semibold text-fg-strong">{p.name}</span>
            <span className="label mt-0.5 text-[0.64rem] text-accent">{p.how}</span>
            <span className="mt-2 flex-1 text-[0.8rem] leading-snug text-muted">{p.what}</span>
            <span className="mt-3">
              <ModalButton label="Connect" title={`Connect ${p.name}`} variant="ghost">
                <ConnectForm provider={p.key} accounts={accounts} />
              </ModalButton>
            </span>
          </div>
        ))}
      </div>

      <Panel title="Connections" className="mb-6" padded={integrations.length === 0}>
        {integrations.length === 0 ? (
          <EmptyState icon="search" title="Nothing connected yet" body="Connect Wise or Stripe above, or add Revolut Business and upload its statement CSV." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Connection", "Provider says", "Books say", "Difference", "Last sync", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${["Provider says", "Books say", "Difference"].includes(h) ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {integrations.map((i) => {
                  const b = booksOf(i.accountId);
                  const same = b && i.providerCurrency === b.account.currency;
                  const diff = same && i.providerBalanceCents != null ? i.providerBalanceCents - b.cents : null;
                  return (
                    <tr key={i.id} className="border-b border-line align-top last:border-0">
                      <td className="px-4 py-3">
                        <span className="block text-[0.92rem] font-medium text-fg">{i.label}</span>
                        <span className="block text-[0.74rem] text-faint">
                          {i.provider === "wise" ? "Wise API" : i.provider === "stripe" ? "Stripe API" : "Statement CSV"} · {i.accountName ?? "no account"}
                          {i.newLines > 0 && (
                            <Link href={`/portal/admin/finance/integrations?c=${i.id}`} className="ml-1.5 text-warn underline underline-offset-4">
                              {i.newLines} to review
                            </Link>
                          )}
                        </span>
                        {i.lastError && <span className="mt-1 block max-w-[24rem] text-[0.74rem] text-warn">{i.lastError}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                        {i.providerBalanceCents != null && i.providerCurrency ? money(i.providerBalanceCents, i.providerCurrency) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">{b ? money(b.cents, b.account.currency) : "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${diff ? "text-warn" : "text-ok"}`}>
                        {diff == null ? "—" : diff === 0 ? "Agrees" : money(diff, b!.account.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[0.8rem] text-muted">
                        {i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
                        <span className={`pill ml-2 ${i.status === "connected" ? "pill-ok" : "pill-warn"}`}>{i.status === "connected" ? "OK" : "Check"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <IntegrationActions id={i.id} label={i.label} hasSecret={i.hasSecret} currency={i.accountCurrency ?? "EUR"} accountId={i.accountId} accounts={accounts} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {diffs.length > 0 && (
          <p className="border-t border-line px-4 py-3 text-[0.8rem] text-muted">
            A difference means the books are missing something the provider shows (review its lines below), or the opening balance of the account needs setting.
          </p>
        )}
      </Panel>

      <Panel title="Statement lines to reconcile" className="mb-6" padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {[
            ["new", `To review · ${newLines.length}`],
            ["matched", "Matched"],
            ["added", "Added"],
            ["ignored", "Ignored"],
            ["all", "All"],
          ].map(([k, l]) => (
            <Link key={k} href={link(k)} className={chip(show === k)}>
              {l}
            </Link>
          ))}
          {sp.c && (
            <Link href={show === "new" ? "/portal/admin/finance/integrations" : `/portal/admin/finance/integrations?show=${show}`} className="text-[0.8rem] text-muted underline underline-offset-4 hover:text-fg">
              {integrations.find((i) => i.id === sp.c)?.label ?? "One connection"} only · show all
            </Link>
          )}
        </div>
        {lines.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="search" title={show === "new" ? "Nothing to review" : "No lines here"} body="Lines from Wise, Stripe or an uploaded statement appear here until each is matched, added or ignored." />
          </div>
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Date", "Connection", "Description", "In (Dr bank)", "Out (Cr bank)", "Status", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h.startsWith("In") || h.startsWith("Out") ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[0.82rem] text-faint">{shortDate(l.date)}</td>
                    <td className="px-4 py-3 text-[0.82rem] text-muted">
                      {l.integrationLabel}
                      <span className="block text-[0.72rem] text-faint">{l.accountName ?? "no account"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-[0.88rem] text-fg">{l.description}</span>
                      {(l.counterparty || l.lineType) && (
                        <span className="block text-[0.74rem] text-faint">{[l.counterparty, l.lineType].filter(Boolean).join(" · ")}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ok">{l.amountCents > 0 ? money(l.amountCents, l.currency) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">{l.amountCents < 0 ? money(-l.amountCents, l.currency) : ""}</td>
                    <td className="px-4 py-3">
                      <span className={`pill ${l.status === "new" ? "pill-warn" : l.status === "ignored" ? "pill-neutral" : "pill-ok"}`}>
                        {l.status === "new" ? "To review" : l.status === "matched" ? "Matched" : l.status === "added" ? "Added" : "Ignored"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <BankLineActions line={l} accounts={accounts} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Bank and cash accounts"
        padded={balances.length === 0}
        action={
          <ModalButton label="+ Add account" title="Add a bank or cash account">
            <AccountForm />
          </ModalButton>
        }
      >
        {balances.length === 0 ? (
          <EmptyState icon="search" title="No accounts yet" body="Add each bank and cash account with its opening balance." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Account", "Connected to", "Opening balance", "Balance in the books", ""].map((h, i) => (
                    <th key={`${h}${i}`} className={`label px-4 py-3 text-faint ${h === "Balance in the books" ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balances.map(({ account: a, cents }) => {
                  const conn = integrations.filter((i) => i.accountId === a.id);
                  return (
                    <tr key={a.id} className={`border-b border-line last:border-0 ${a.active ? "" : "opacity-55"}`}>
                      <td className="px-4 py-3 text-[0.92rem] font-medium text-fg">
                        {a.name}
                        <span className="ml-2 text-[0.76rem] font-normal text-faint">
                          {a.kind === "cash" ? "Cash" : "Bank"} · {a.currency}
                        </span>
                        {a.defaultIn && <span className="pill pill-info ml-2">Fees land here</span>}
                      </td>
                      <td className="px-4 py-3 text-[0.84rem] text-muted">{conn.length ? conn.map((i) => i.label).join(", ") : "Not connected"}</td>
                      <td className="px-4 py-3 text-[0.84rem] text-muted">
                        {money(a.openingCents, a.currency)} <span className="text-faint">on {shortDate(a.openingOn)}</span>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${cents < 0 ? "text-danger" : "text-fg"}`}>{money(cents, a.currency)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-start gap-1.5">
                          <ModalButton label="Edit" title={`Edit ${a.name}`} variant="ghost">
                            <AccountForm initial={a} />
                          </ModalButton>
                          <AccountActive id={a.id} name={a.name} active={a.active} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

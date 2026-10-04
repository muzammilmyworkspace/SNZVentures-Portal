import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/guard";
import * as invoices from "@/lib/db/repos/invoices";
import { company } from "@/lib/invoices/company";
import { CURRENCIES, formatMoney } from "@/lib/invoices/model";
import { InvoiceActions } from "@/components/portal/InvoiceActions";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE DOCUMENT.
 *
 * Deliberately NOT themed. The portal around it follows dark or light; the
 * invoice is ink on paper in both, because a document whose colours follow a
 * personal display preference is one that prints differently depending on a
 * setting nobody remembers making — and it is the printed copy that a customer
 * keeps.
 *
 * Everything outside `.invoice-paper` carries `print:hidden`, so what comes
 * out of the printer is the invoice and nothing else.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  const invoice = await invoices.getById(id);
  if (!invoice) notFound();

  const co = company();
  const currencyName = CURRENCIES[invoice.currency]?.name ?? invoice.currency;

  return (
    <>
      <div className="print:hidden">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="label mb-2.5 flex items-center gap-3 text-accent">
              <span aria-hidden className="inline-block h-px w-6 bg-current opacity-50" />
              {invoice.number}
            </p>
            <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.03em] text-fg-strong">
              {invoice.billToName}
            </h1>
            <p className="mt-2 text-[0.9rem] text-muted">
              {formatMoney(invoice.totalCents, invoice.currency)} · issued {invoice.issuedOn}
              {invoice.dueOn ? ` · due ${invoice.dueOn}` : ""}
              {invoice.createdByName ? ` · raised by ${invoice.createdByName}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/portal/admin/invoices"
              className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full border border-line px-4 text-muted transition-colors hover:text-fg"
            >
              ← All invoices
            </Link>
            <InvoiceActions id={invoice.id} status={invoice.status} number={invoice.number} />
          </div>
        </div>

        <p className="mb-6 rounded-[var(--radius-sm)] border border-line bg-raised p-3.5 text-[0.84rem] leading-relaxed text-muted">
          {/* Said plainly, because the alternative — a library that paints the
              page into an image — produces a file that looks like a PDF and
              cannot be selected, searched or read by a screen reader. */}
          <strong className="font-semibold text-fg">Download</strong> opens your browser&rsquo;s print
          dialog; choose <strong className="font-semibold text-fg">Save as PDF</strong> as the
          destination. That gives real, selectable text at any zoom rather than a picture of a page.
        </p>
      </div>

      {/* ------------------------------------------------------- the paper -- */}
      <div className="invoice-paper mx-auto max-w-[820px] rounded-[var(--radius-md)] bg-white p-10 text-[13.5px] leading-relaxed text-[#0C1526] shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:p-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-3.5">
            <Image
              src="/brand/snz-mark.png"
              alt=""
              width={52}
              height={52}
              className="rounded-full"
              style={{ width: 52, height: 52 }}
            />
            <div>
              <p className="text-[1.12rem] font-extrabold tracking-[-0.02em] text-[#0C1526]">{co.name}</p>
              <address className="mt-1 text-[0.8rem] not-italic leading-relaxed text-[#4A566D]">
                {co.address}
                <br />
                {co.email}
                <br />
                {co.site}
                {co.vatNumber && (
                  <>
                    <br />
                    VAT {co.vatNumber}
                  </>
                )}
                {co.registration && (
                  <>
                    <br />
                    Reg. {co.registration}
                  </>
                )}
              </address>
            </div>
          </div>

          <div className="text-right text-[0.82rem] text-[#4A566D]">
            <p className="text-[1.9rem] font-extrabold leading-none tracking-[-0.03em] text-[#0C1526]">
              INVOICE
            </p>
            <p className="mt-1.5 text-[1.02rem] font-bold tabular-nums text-[#0C1526]">{invoice.number}</p>
            <p className="mt-2.5">
              Issued <strong className="font-semibold text-[#0C1526]">{invoice.issuedOn}</strong>
            </p>
            {invoice.dueOn && (
              <p>
                Due <strong className="font-semibold text-[#0C1526]">{invoice.dueOn}</strong>
              </p>
            )}
            {invoice.status === "paid" && (
              <p className="mt-3">
                <span className="inline-block -rotate-3 rounded border-2 border-[#1E8A5F] px-3 py-0.5 text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-[#1E8A5F]">
                  Paid
                </span>
              </p>
            )}
            {invoice.status === "void" && (
              <p className="mt-3">
                <span className="inline-block -rotate-3 rounded border-2 border-[#C0392B] px-3 py-0.5 text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-[#C0392B]">
                  Void
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="my-7 h-px bg-[#E1E7F0]" />

        <p className="label mb-1.5 text-[#697690]">Billed to</p>
        <p className="text-[1rem] font-bold text-[#0C1526]">{invoice.billToName}</p>
        {invoice.billToEmail && <p className="text-[0.84rem] text-[#4A566D]">{invoice.billToEmail}</p>}
        {invoice.billToAddress && (
          <p className="mt-0.5 whitespace-pre-line text-[0.84rem] text-[#4A566D]">{invoice.billToAddress}</p>
        )}

        <table className="mt-7 w-full border-collapse text-[0.86rem]">
          <thead>
            <tr>
              <th className="label border-b border-[#C7D0DF] pb-2.5 text-left text-[#697690]">Description</th>
              <th className="label border-b border-[#C7D0DF] pb-2.5 text-right text-[#697690]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i}>
                <td className="border-b border-[#EEF2F7] py-3 align-top text-[#0C1526]">{line.desc}</td>
                <td className="border-b border-[#EEF2F7] py-3 text-right align-top tabular-nums text-[#0C1526]">
                  {formatMoney(line.amountCents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-5 w-[290px] text-[0.88rem]">
          <div className="flex justify-between py-1.5">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(invoice.subtotalCents, invoice.currency)}</span>
          </div>
          {invoice.vatBp > 0 && (
            <div className="flex justify-between py-1.5">
              <span>VAT {invoice.vatBp / 100}%</span>
              <span className="tabular-nums">{formatMoney(invoice.vatCents, invoice.currency)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t-2 border-[#0C1526] pt-3 text-[1.12rem] font-extrabold">
            <span>Total due</span>
            <span className="tabular-nums">{formatMoney(invoice.totalCents, invoice.currency)}</span>
          </div>
        </div>

        {(invoice.notes || co.payTo) && (
          <div className="mt-7 rounded-md border border-[#E1E7F0] bg-[#F7F9FC] p-4 text-[0.8rem] leading-relaxed text-[#2E3849]">
            {co.payTo && <p className="whitespace-pre-line font-semibold">{co.payTo}</p>}
            {invoice.notes && <p className={`whitespace-pre-line ${co.payTo ? "mt-2.5" : ""}`}>{invoice.notes}</p>}
          </div>
        )}

        <p className="mt-8 border-t border-[#EEF2F7] pt-4 text-center text-[0.72rem] leading-relaxed text-[#697690]">
          {co.name} · {co.address} · Amounts in {currencyName}
          <br />
          Thank you. Please quote <strong className="font-semibold">{invoice.number}</strong> with your payment.
        </p>
      </div>
    </>
  );
}

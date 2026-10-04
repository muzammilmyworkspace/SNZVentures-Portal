import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guard";
import * as invoices from "@/lib/db/repos/invoices";
import { formatMoney, type InvoiceStatus } from "@/lib/invoices/model";
import { PortalHeading, Panel } from "@/components/portal/Pieces";

export const metadata: Metadata = { title: "Invoices", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * EVERY INVOICE THE FIRM HAS RAISED.
 *
 * Super admin only — narrower than the rest of the admin area on purpose. An
 * invoice is the firm speaking about money in its own name.
 */

const TONE: Record<InvoiceStatus, string> = {
  draft: "border-line bg-raised text-muted",
  sent: "border-amber-300/40 bg-amber-300/[0.08] text-warn",
  paid: "border-moss-500/40 bg-moss-500/[0.10] text-ok",
  void: "border-line bg-raised text-faint line-through",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireSuperAdmin();
  const { status, q } = await searchParams;

  const filter = (["draft", "sent", "paid", "void"] as const).includes(status as InvoiceStatus)
    ? (status as InvoiceStatus)
    : "all";

  const { rows, totalsByCurrency } = await invoices.list({ status: filter, q });

  return (
    <>
      <PortalHeading
        eyebrow="Billing"
        title="Invoices"
        lead="Raise an invoice for anybody — they do not need a portal account, which matters while most first conversations are still on WhatsApp."
        action={
          <Link
            href="/portal/admin/invoices/new"
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300"
          >
            + Create new invoice
          </Link>
        }
      />

      <Panel
        title={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
        action={
          <span className="label text-faint">
            {/* Voided invoices are excluded from the total but stay in the list:
                the number must remain visible in sequence, and a cancelled
                document is not money raised. */}
            {totalsByCurrency.length
              ? totalsByCurrency.map((t) => formatMoney(t.cents, t.currency)).join(" · ") + " raised"
              : "—"}
          </span>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "draft", "sent", "paid", "void"] as const).map((s) => (
            <Link
              key={s}
              href={s === "all" ? "/portal/admin/invoices" : `/portal/admin/invoices?status=${s}`}
              className={`label inline-flex min-h-9 items-center rounded-[var(--radius-sm)] border px-3 capitalize transition-colors ${
                filter === s
                  ? "border-moss-400/40 bg-moss-400/10 text-fg"
                  : "border-line text-muted hover:text-fg"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-[0.88rem] leading-relaxed text-muted">
            Nothing here yet. Press <span className="font-semibold text-fg">Create new invoice</span> above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.86rem]">
              <thead>
                <tr>
                  {["Number", "Date", "Billed to", "Amount", "Status", ""].map((h, i) => (
                    <th
                      key={h || i}
                      className={`label border-b border-line px-2.5 pb-2.5 text-faint ${
                        h === "Amount" ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id}>
                    <td className="border-b border-line px-2.5 py-3 font-semibold tabular-nums text-fg-strong">
                      {inv.number}
                    </td>
                    <td className="border-b border-line px-2.5 py-3 tabular-nums text-muted">
                      {inv.issuedOn}
                    </td>
                    <td className="border-b border-line px-2.5 py-3">
                      <span className="font-semibold text-fg">{inv.billToName}</span>
                      {inv.billToEmail && (
                        <span className="block text-[0.78rem] text-faint">{inv.billToEmail}</span>
                      )}
                    </td>
                    <td className="border-b border-line px-2.5 py-3 text-right font-semibold tabular-nums text-fg-strong">
                      {formatMoney(inv.totalCents, inv.currency)}
                    </td>
                    <td className="border-b border-line px-2.5 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold capitalize ${TONE[inv.status]}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="border-b border-line px-2.5 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/portal/admin/invoices/${inv.id}`}
                        className="label inline-flex min-h-9 items-center rounded-[var(--radius-sm)] border border-line px-3 text-muted transition-colors hover:text-fg"
                      >
                        Open
                      </Link>
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

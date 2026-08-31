import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { listFeeSubmissions } from "@/lib/db/repos/fees";
import { formatAmount } from "@/lib/portal/payment-consent";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { FeeReview } from "@/components/portal/FeeReview";

export const metadata: Metadata = { title: "Fee verification" };

/**
 * FEE VERIFICATION QUEUE — staff.
 *
 * This is the button that opens a student's portal, so it shows the receipt
 * and the declared figures side by side: verifying a payment from the amount
 * alone, without opening the receipt, is how the wrong number gets approved.
 *
 * The receipt link goes through /api/portal/documents/[id], which authorises
 * the viewer and mints a short-lived URL. Staff see it because they are staff,
 * not because the page happens to hold a key.
 */
export default async function AdminFeesPage() {
  await requireStaff();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading title="Fee verification" lead="Student payment declarations awaiting review." />
        <NotConfigured what="database" />
      </>
    );
  }

  const { rows, pending } = await listFeeSubmissions(null, 100);
  const waiting = rows.filter((r) => r.status === "submitted");
  const done = rows.filter((r) => r.status !== "submitted");

  return (
    <>
      <PortalHeading
        title="Fee verification"
        lead={
          pending === 0
            ? "Nothing is waiting. Verified students have their application form open."
            : `${pending} ${pending === 1 ? "student is" : "students are"} waiting on a decision. Until you make it, their application form stays locked.`
        }
      />

      <Panel title="Awaiting review">
        {waiting.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="New fee declarations appear here as students submit them."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {waiting.map((f) => (
              <li key={f.id}>
                <FeeReview
                  id={f.id}
                  student={f.studentName}
                  email={f.studentEmail}
                  amount={formatAmount(f.amount, f.currency)}
                  university={f.university}
                  feeType={f.feeType}
                  method={f.method}
                  txnRef={f.txnRef}
                  payDate={f.payDate}
                  thirdParty={f.thirdParty}
                  payerName={f.payerName}
                  payerRelation={f.payerRelation}
                  signedName={f.signedName}
                  submittedAt={f.createdAt}
                  receiptDocumentId={f.receiptDocumentId}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {done.length > 0 && (
        <Panel title="Already decided" className="mt-6">
          <ul className="divide-y divide-[var(--line)]">
            {done.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 flex-1 truncate text-[0.9rem] text-fg">
                  {f.studentName}
                </span>
                <span className="text-[0.85rem] text-muted">
                  {formatAmount(f.amount, f.currency)}
                </span>
                <StatusPill
                  status={f.status === "verified" ? "approved" : "rejected"}
                  label={f.status === "verified" ? "Verified" : "Returned"}
                />
                {f.reviewNote && (
                  <span className="w-full text-[0.82rem] leading-relaxed text-faint">
                    {f.reviewNote}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

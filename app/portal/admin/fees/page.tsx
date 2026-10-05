import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { listFeeSubmissions } from "@/lib/db/repos/fees";
import { formatAmount } from "@/lib/portal/payment-consent";
import { PortalHeading, Panel, EmptyState, StatusPill, StatCard, Tabs } from "@/components/portal/Pieces";
import { FeeReview } from "@/components/portal/FeeReview";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Person } from "@/components/portal/Avatar";
import { BroughtByTag, DateTag, SlipButton } from "@/components/portal/FeeBits";

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
 *
 * UNVERIFIED FIRST, AND APART. The waiting ones are work; the decided ones are
 * a record. Mixing them made the queue look longer than it was and hid the one
 * that mattered under the ones already done.
 */
export default async function AdminFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading title="Fee verification" lead="Student payment declarations awaiting review." />
        <NotConfigured what="database" />
      </>
    );
  }

  const { rows, pending } = await listFeeSubmissions(null, 300);
  const waiting = rows.filter((r) => r.status === "submitted");
  const verified = rows.filter((r) => r.status === "verified");
  const returned = rows.filter((r) => r.status === "rejected");

  // ALL by default: the whole picture first, then narrow to what is waiting.
  const TABS = [
    { key: "all", label: "All", rows },
    { key: "unverified", label: "Unverified", rows: waiting },
    { key: "verified", label: "Verified", rows: verified },
    { key: "returned", label: "Returned", rows: returned },
  ];
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  // Review cards are tall, so ten a page; the decided table is compact.
  const size = tab.key === "unverified" ? 10 : 20;
  const pg = paginate(tab.rows, pageFrom(sp.page), size);
  const tabHref = (key: string) => (key === "all" ? "/portal/admin/fees" : `/portal/admin/fees?tab=${key}`);

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

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total requests"
          value={rows.length}
          hint="Every fee declaration students have sent."
          href="/portal/admin/fees"
        />
        <StatCard
          label="Unverified"
          value={waiting.length}
          urgent={waiting.length > 0}
          hint="Waiting for you to check the bank slip."
          href="/portal/admin/fees?tab=unverified"
        />
        <StatCard
          label="Verified"
          value={verified.length}
          hint="Payment confirmed; their application is open."
          href="/portal/admin/fees?tab=verified"
        />
        <StatCard
          label="Returned"
          value={returned.length}
          hint="Sent back to the student to correct."
          href="/portal/admin/fees?tab=returned"
        />
      </div>

      <Tabs
        label="Fee declarations"
        items={TABS.map((t) => ({ key: t.key, label: t.label, count: t.rows.length, href: tabHref(t.key) }))}
        active={tab.key}
      />

      {tab.key === "unverified" ? (
        <Panel title="Unverified: check the slip, then decide">
          {waiting.length === 0 ? (
            <EmptyState title="Nothing waiting" body="New fee declarations appear here as students submit them." />
          ) : (
            <ul className="flex flex-col gap-4">
              {pg.rows.map((f) => (
                <li key={f.id}>
                  <FeeReview
                    id={f.id}
                    student={f.studentName}
                    userId={f.userId}
                    avatarV={f.avatarV}
                    consultantName={f.consultantName}
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
                    passport={f.declarantPassport}
                    nationality={f.declarantNationality}
                    city={f.declarantCity}
                    phone={f.declarantPhone}
                    submittedAt={f.createdAt}
                    receiptDocumentId={f.receiptDocumentId}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pager
            inset
            page={pg.page}
            pages={pg.pages}
            total={pg.total}
            size={size}
            basePath="/portal/admin/fees"
            params={sp}
            noun="waiting"
          />
        </Panel>
      ) : (
        <Panel padded={tab.rows.length === 0}>
          {tab.rows.length === 0 ? (
            <EmptyState
              title={tab.key === "all" ? "No fee declarations yet" : `Nothing ${tab.label.toLowerCase()} yet`}
              body="Fee declarations appear here once they have been decided."
            />
          ) : (
            <div className="rail overflow-x-auto">
              <table className="w-full min-w-[920px] text-left">
                <caption className="sr-only">{tab.label} fee declarations</caption>
                <thead>
                  <tr className="border-b border-line">
                    {["Student", "Brought by", "Amount", "Sent", "Decided", "Status", ""].map((h, i) => (
                      <th key={h || i} scope="col" className="label px-5 py-3 text-faint">
                        {h || <span className="sr-only">Bank slip</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pg.rows.map((f) => (
                    <tr key={f.id} className="border-b border-line align-top last:border-0">
                      <td className="px-5 py-3">
                        <Person
                          id={f.userId}
                          name={f.studentName}
                          sub={f.studentEmail}
                          photo={f.avatarV != null}
                          v={f.avatarV}
                          size="md"
                        >
                          <Link
                            href={`/portal/admin/users/${f.userId}`}
                            className="block truncate text-[0.9rem] text-fg underline-offset-4 hover:text-accent hover:underline"
                          >
                            {f.studentName}
                          </Link>
                        </Person>
                        {f.reviewNote && f.status === "rejected" && (
                          <p className="mt-2 max-w-sm text-[0.8rem] leading-relaxed text-faint">{f.reviewNote}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <BroughtByTag name={f.consultantName} />
                      </td>
                      <td className="px-5 py-3 text-[0.88rem] text-fg">
                        {formatAmount(f.amount, f.currency)}
                        <span className="block text-[0.78rem] text-faint">{f.university}</span>
                      </td>
                      <td className="px-5 py-3">
                        <DateTag iso={f.createdAt} />
                      </td>
                      <td className="px-5 py-3">
                        <DateTag iso={f.reviewedAt} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill
                          status={f.status === "verified" ? "approved" : f.status === "rejected" ? "rejected" : "pending"}
                          label={f.status === "verified" ? "Verified" : f.status === "rejected" ? "Returned" : "Unverified"}
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <SlipButton documentId={f.receiptDocumentId} end />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={pg.page}
            pages={pg.pages}
            total={pg.total}
            size={size}
            basePath="/portal/admin/fees"
            params={sp}
            noun="declarations"
          />
        </Panel>
      )}
    </>
  );
}

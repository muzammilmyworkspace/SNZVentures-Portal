import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { listFeeSubmissions } from "@/lib/db/repos/fees";
import { formatAmount } from "@/lib/portal/payment-consent";
import { PortalHeading, Panel, EmptyState, StatCard, Tabs } from "@/components/portal/Pieces";
import { FeeReview } from "@/components/portal/FeeReview";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Person } from "@/components/portal/Avatar";
import { BroughtByTag, DateTag, SlipButton } from "@/components/portal/FeeBits";
import { requireArea } from "@/lib/auth/permissions";
import { FeeActions, ReturnIcon } from "@/components/portal/FeeActions";
import { NewMessageButton } from "@/components/portal/NewMessage";
import { EscapeTo } from "@/components/portal/EscapeTo";
import { memberId } from "@/lib/portal/member-id";
import type { FeeSubmission } from "@/lib/db/repos/fees";

/** Status with its icon: a tick when verified, the return arrow when returned, a clock while waiting. */
function FeeStatus({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <span className="pill pill-ok inline-flex items-center gap-1.5">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
        Verified
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="pill pill-danger inline-flex items-center gap-1.5">
        <ReturnIcon />
        Returned
      </span>
    );
  }
  return (
    <span className="pill pill-warn inline-flex items-center gap-1.5">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.5" />
      </svg>
      Unverified
    </span>
  );
}

function reviewProps(f: FeeSubmission) {
  return {
    id: f.id,
    student: f.studentName,
    userId: f.userId,
    avatarV: f.avatarV,
    memberNo: f.memberNo,
    consultantName: f.consultantName,
    email: f.studentEmail,
    amount: formatAmount(f.amount, f.currency),
    university: f.university,
    feeType: f.feeType,
    method: f.method,
    txnRef: f.txnRef,
    payDate: f.payDate,
    thirdParty: f.thirdParty,
    payerName: f.payerName,
    payerRelation: f.payerRelation,
    signedName: f.signedName,
    passport: f.declarantPassport,
    nationality: f.declarantNationality,
    city: f.declarantCity,
    phone: f.declarantPhone,
    submittedAt: f.createdAt,
    receiptDocumentId: f.receiptDocumentId,
  };
}

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
  await requireArea("fees");

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
  // The eye opens one declaration in full over the list (?view=<id>).
  const here = (view?: string) => {
    const q = new URLSearchParams();
    if (tab.key !== "all") q.set("tab", tab.key);
    if (typeof sp.page === "string") q.set("page", sp.page);
    if (view) q.set("view", view);
    const qs = q.toString();
    return qs ? `/portal/admin/fees?${qs}` : "/portal/admin/fees";
  };
  const viewing = typeof sp.view === "string" ? rows.find((r) => r.id === sp.view) ?? null : null;

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
      {tab.key === "returned" && (
        <p className="note-warn -mt-2 mb-5 flex items-start gap-2 p-3 text-[0.84rem] leading-relaxed">
          <ReturnIcon />
          <span>
            Returned fees went back to the student with your note. They correct it and send it again; the new one
            appears under Unverified.
          </span>
        </p>
      )}

      {viewing && (
        <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-label="Fee declaration">
          <EscapeTo href={here()} />
          <Link href={here()} scroll={false} aria-label="Close" className="absolute inset-0 bg-[rgb(4_8_20/0.6)] backdrop-blur-[2px]" />
          <div className="relative h-full w-full max-w-[720px] overflow-y-auto border-l border-line bg-[var(--panel-solid)] p-5 shadow-2xl sm:p-7">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-[1.15rem] font-semibold text-fg-strong">Fee declaration</h2>
              <Link href={here()} scroll={false} aria-label="Close" data-tip="Close" className="tip tip-end icon-btn">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </Link>
            </div>
            <FeeReview {...reviewProps(viewing)} status={viewing.status as never} reviewNote={viewing.reviewNote} />
          </div>
        </div>
      )}

      {tab.key === "unverified" ? (
        <Panel title="Unverified: check the slip, then decide">
          {waiting.length === 0 ? (
            <EmptyState title="Nothing waiting" body="New fee declarations appear here as students submit them." />
          ) : (
            <ul className="flex flex-col gap-4">
              {pg.rows.map((f) => (
                <li key={f.id}>
                  <FeeReview {...reviewProps(f)} />
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
              <table className="w-full min-w-[900px] text-left">
                <caption className="sr-only">{tab.label} fee declarations</caption>
                <thead>
                  <tr className="border-b border-line">
                    {["#", "ID", "Student", "Brought by", "Amount", "Sent", "Status", ""].map((h, i) => (
                      <th key={h || i} scope="col" className="label px-3 py-3 text-faint first:pl-5 last:pr-5">
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pg.rows.map((f, idx) => (
                    <tr key={f.id} className="border-b border-line align-top last:border-0">
                      <td className="py-3 pl-5 pr-3 font-mono text-[0.8rem] text-faint">{(pg.page - 1) * pg.size + idx + 1}</td>
                      <td className="px-3 py-3">
                        <span data-group="student" className="group-id whitespace-nowrap font-mono text-[0.75rem] font-semibold">
                          {memberId("student", f.memberNo)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
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
                      <td className="px-3 py-3">
                        <BroughtByTag name={f.consultantName} />
                      </td>
                      <td className="px-3 py-3 text-[0.88rem] text-fg">
                        <span className="whitespace-nowrap">{formatAmount(f.amount, f.currency)}</span>
                        <span className="block max-w-[11rem] text-[0.78rem] leading-snug text-faint">{f.university}</span>
                      </td>
                      <td className="px-3 py-3">
                        <DateTag iso={f.createdAt} />
                      </td>
                      <td className="px-3 py-3">
                        <FeeStatus status={f.status} />
                        {f.reviewedAt && (
                          <span className="mt-1.5 block">
                            <DateTag iso={f.reviewedAt} />
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        <span className="inline-flex items-center gap-2">
                          <Link
                            href={here(f.id)}
                            scroll={false}
                            aria-label={`Open the fee declaration of ${f.studentName}`}
                            data-tip="View declaration"
                            className="tip icon-btn"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                              <circle cx="8" cy="8" r="2" />
                            </svg>
                          </Link>
                          <SlipButton documentId={f.receiptDocumentId} />
                          {/* A comment lands in the student's messages and bell; the fee stays as it is. */}
                          <NewMessageButton
                            tip="Send a comment"
                            preset={{ id: f.userId, name: f.studentName, email: f.studentEmail, role: "student", memberNo: f.memberNo, avatarV: f.avatarV }}
                          />
                          {f.status === "submitted" && <FeeActions id={f.id} student={f.studentName} />}
                        </span>
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

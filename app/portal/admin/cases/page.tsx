import Link from "next/link";
import { redirect } from "next/navigation";
import { permissionsOf } from "@/lib/auth/permissions";
import { canUse } from "@/lib/portal/permissions";
import { requireStaff, isAdmin } from "@/lib/auth/guard";
import { getAllCases, getCasesForAdvisor } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState, StatusPill } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { CaseStatusControl } from "@/components/portal/CaseStatusControl";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { Avatar } from "@/components/portal/Avatar";
import { ApplicationReview } from "@/components/portal/ApplicationReview";
import { DocumentsDrawer } from "@/components/portal/DocumentsDrawer";

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const reviewId = typeof sp.review === "string" ? sp.review : null;
  const docsId = typeof sp.docs === "string" ? sp.docs : null;
  /** This page's URL with one window open (or none), keeping the page number. */
  const casesHref = (open: { review?: string; docs?: string }) => {
    const q = new URLSearchParams();
    if (typeof sp.page === "string") q.set("page", sp.page);
    if (open.review) q.set("review", open.review);
    if (open.docs) q.set("docs", open.docs);
    const qs = q.toString();
    return qs ? `/portal/admin/cases?${qs}` : "/portal/admin/cases";
  };
  const { session, role } = await requireStaff();
  // Firm-wide for an admin, so an employee needs the Applications area.
  if (isAdmin(role) && !canUse(role, await permissionsOf(session.userId), "applications")) redirect("/portal/admin");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Cases" />
        <NotConfigured what="Case management" />
      </>
    );
  }

  // Admins see everything; advisors see only what is assigned to them — scoped in SQL.
  const cases = isAdmin(role)
    ? await getAllCases(200)
    : await getCasesForAdvisor(session.userId);
  const pg = paginate(cases, pageFrom(sp.page));

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Cases"
        /*
          Named against the other page. An admin comparing this count with the
          one on Your Students was comparing every case in the firm with their
          own book, and read the difference as data going missing.
        */
        lead={
          isAdmin(role)
            ? "Every open and closed case in the firm — not only your own. Your own book is on Your Students."
            : "Every case of yours, including clients with more than one."
        }
      />
      {/*
        Opened only for something already in THIS list. An advisor's list is
        scoped in SQL, so checking against it keeps them to their own students
        however the URL is edited.
      */}
      {reviewId && cases.some((c) => c.intakeId === reviewId) && (
        <ApplicationReview intakeId={reviewId} closeHref={casesHref({})} />
      )}
      {docsId && cases.some((c) => c.clientId === docsId) && (
        <DocumentsDrawer
          userId={docsId}
          previewId={typeof sp.preview === "string" ? sp.preview : null}
          baseHref={{ open: casesHref({ docs: docsId }), close: casesHref({}) }}
        />
      )}
      <Panel padded={cases.length === 0}>
        {cases.length === 0 ? (
          <EmptyState icon="file" title="No cases" body="Cases appear here once opened for a client." />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Cases</caption>
              <thead>
                <tr className="border-b border-line">
                  {["#", "Reference", "Client", "Case", "Pathway", "Status", "Consultant", "Updated", ""].map((h) => (
                    <th key={h} scope="col" className="label px-5 py-3 text-faint">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((c, idx) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-mono text-[0.8rem] text-faint">{(pg.page - 1) * pg.size + idx + 1}</td>
                    {/* Generated for every case since 003 and, until now, shown
                        nowhere — which made it useless for naming a case in an
                        email instead of reading out a UUID. */}
                    <td className="px-5 py-3">
                      <span className="num text-[0.8rem] text-faint">{c.reference ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3 text-[0.9rem] text-fg">
                      <span className="flex items-center gap-3">
                        <Avatar id={c.clientId} name={c.clientName} photo={c.clientAvatarV != null} v={c.clientAvatarV} />
                        <span>
                          {c.clientName}
                          {c.country && (
                            <span className="mt-0.5 block text-[0.78rem] text-faint">{c.country}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">
                      {c.title}
                      {/* What the case is waiting for. Written at creation and
                          never displayed, so the queue said what each case WAS
                          but not what to do about it. */}
                      {c.nextAction && (
                        <span className="mt-0.5 block text-[0.78rem] text-faint">{c.nextAction}</span>
                      )}
                    </td>
                    <td className="px-5 py-3"><span className="label text-faint">{c.pathway}</span></td>
                    <td className="px-5 py-3">
                      <StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />
                    </td>
                    {/*
                      The advisor ON THE CASE if one was assigned, otherwise the
                      client's consultant. Reading only the first showed "—"
                      against every case, including students who plainly had
                      somebody — the two are different facts and nothing sets
                      the case one when a consultant enrols a student.
                    */}
                    <td className="px-5 py-3 text-[0.85rem]">
                      {c.advisorName ? (
                        <span className="text-muted">{c.advisorName}</span>
                      ) : c.consultantName ? (
                        <span className="text-muted">
                          {c.consultantName}
                          <span className="mt-0.5 block text-[0.72rem] text-faint">
                            via their consultant
                          </span>
                        </span>
                      ) : (
                        <span className="text-faint">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[0.8rem] text-faint">
                      {new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <Link
                          href={casesHref({ docs: c.clientId })}
                          scroll={false}
                          aria-label={`${c.clientName}'s documents`}
                          data-tip="Documents"
                          className="tip icon-btn"
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
                            <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
                          </svg>
                        </Link>
                        {c.intakeId ? (
                          <Link
                            href={casesHref({ review: c.intakeId })}
                            scroll={false}
                            aria-label={`Open ${c.clientName}'s application`}
                            data-tip="View application"
                            className="tip tip-end icon-btn"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                              <circle cx="8" cy="8" r="2" />
                            </svg>
                          </Link>
                        ) : (
                          <span
                            tabIndex={0}
                            aria-label="No application form on this case"
                            data-tip="No application on this case"
                            className="tip tip-end icon-btn cursor-not-allowed opacity-40"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                              <circle cx="8" cy="8" r="2" />
                            </svg>
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={pg.page} pages={pg.pages} total={pg.total} basePath="/portal/admin/cases" params={sp} noun="cases" />
      </Panel>
      <p className="mt-5 text-[0.8rem] text-faint">
        Clients cannot change case status. Only staff may advance a case, and every change is recorded in the{" "}
        <Link href="/portal/admin/audit" className="text-accent underline underline-offset-4">audit log</Link>.
      </p>

      {cases.length > 0 && (
        <div className="mt-5">
          <Panel title="Update a case">
            {/*
              Below the table rather than inside it. A table is for scanning;
              putting a select and a text field in every row turns forty cases
              into a wall of controls and makes the overview unreadable.
            */}
            {cases.slice(0, 25).map((c) => (
              <CaseStatusControl
                key={c.id}
                caseId={c.id}
                current={c.status}
                title={`${c.clientName} — ${c.title}`}
              />
            ))}
            {cases.length > 25 && (
              <p className="mt-4 text-[0.8rem] text-faint">
                Showing the 25 most recently updated. Older cases are in the
                table above.
              </p>
            )}
          </Panel>
        </div>
      )}

    </>
  );
}

import Link from "next/link";
import { studentHistory, type HistoryEvent } from "@/lib/db/repos/operations";
import { findById } from "@/lib/db/repos/users";
import { Person, Avatar } from "./Avatar";
import { REVIEW_LABEL } from "@/lib/portal/review-status";

/**
 * A STUDENT'S HISTORY, like a commit log for their file.
 *
 * Opened by `?history=<user id>`. Every event says who did it (and in what
 * role), what they did in plain words, when to the minute, and the detail
 * that matters: which fields changed, from which stage to which, what was
 * said. Grouped by day, newest first. Read-only.
 */

const DOC_STATUS: Record<string, string> = {
  approved: "Approved",
  rejected: "Not accepted",
  needs_update: "Asked for a new copy of",
  pending_review: "Marked for review",
};

const CASE_STATUS: Record<string, string> = {
  new: "New",
  assessment: "Assessment",
  in_progress: "In progress",
  documents_required: "Documents required",
  under_review: "Under review",
  awaiting_client: "Waiting on the student",
  completed: "Completed",
  closed: "Closed",
};

function roleLabel(role: string | null, isStudent: boolean): string {
  if (isStudent) return "Student";
  if (!role) return "System";
  if (role === "advisor") return "Consultant";
  if (role === "admin") return "Admin";
  if (role === "super_admin") return "Super admin";
  return "Client";
}

/** One event as a sentence and its detail lines. */
function describe(e: HistoryEvent): { what: string; detail?: string[] } {
  const m = (e.meta ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  switch (e.action) {
    case "account.created":
      return { what: "Created their account" };
    case "auth.email_verified":
      return { what: "Confirmed their email address" };
    case "auth.account_set_up":
      return { what: "Set up their account" };
    case "auth.password_reset":
      return { what: "Changed their password with a reset link" };
    case "user.email_changed":
      return { what: "Changed the sign-in email address" };
    case "invite.claimed":
      return { what: m.via === "code" ? "Joined their consultant with a consultant code" : "Joined their consultant through an invite link" };
    case "staff.assigned":
      return { what: "Assigned the student to a consultant" };
    case "staff.unassigned":
      return { what: "Removed the student from a consultant" };
    case "fee.submitted":
      return {
        what: "Sent the fee declaration",
        detail: [[str(m.feeType), str(m.university), m.amount ? `${str(m.currency)} ${str(m.amount)}` : ""].filter(Boolean).join(" · ")].filter(Boolean),
      };
    case "fee.verified":
      return { what: "Verified the fee payment" };
    case "fee.rejected":
      return { what: "Returned the fee declaration to the student" };
    case "fee.withdrawn":
      return { what: "Withdrew the fee declaration" };
    case "document.uploaded":
      return { what: `Uploaded ${e.documentName ? `“${e.documentName}”` : "a document"}`, detail: [str(m.category)].filter(Boolean) };
    case "document.reviewed": {
      if (m.bulk) return { what: `Approved ${str(m.count)} documents at once` };
      const verb = DOC_STATUS[str(m.status)] ?? "Reviewed";
      return { what: `${verb} ${e.documentName ? `“${e.documentName}”` : "a document"}` };
    }
    case "document.deleted":
      return { what: "Deleted a document" };
    case "intake.edited":
      return {
        what: "Changed their application",
        detail: [
          m.step ? `In “${str(m.step)}”` : "",
          Array.isArray(m.fields) ? `Fields changed: ${(m.fields as unknown[]).map(String).join(", ")}` : "",
        ].filter(Boolean),
      };
    case "consent.accepted":
      return { what: "Signed the consent and undertaking" };
    case "case.created":
      return { what: "Opened a case" };
    case "case.status_changed":
      return { what: `Moved the case to ${CASE_STATUS[str(m.to)] ?? str(m.to)}`, detail: m.from ? [`Was ${CASE_STATUS[str(m.from)] ?? str(m.from)}`] : undefined };
    case "case.advisor_assigned":
      return { what: "Assigned an advisor to the case" };
    case "message.sent":
      return { what: "Sent a message" };
    case "note.added":
      return { what: "Added an internal note" };
    case "user.role_changed":
      return { what: "Changed the account type", detail: m.to ? [`Now ${str(m.to)}`] : undefined };
    case "user.suspended":
      return { what: "Suspended the account" };
    case "user.activated":
      return { what: "Re-activated the account" };
    case "user.password_reset_link":
      return { what: "Made a password reset link" };
    case "user.impersonation_started":
      return { what: "Viewed the portal as this student" };
    case "status.application": {
      const to = REVIEW_LABEL[e.toStatus ?? ""] ?? e.toStatus;
      const from = e.fromStatus ? REVIEW_LABEL[e.fromStatus] ?? e.fromStatus : null;
      return {
        what: e.toStatus === "submitted" && (!from || from === "Draft" || from === "Changes requested")
          ? from === "Changes requested" ? "Sent the application again" : "Submitted the application"
          : `Moved the application to ${to}`,
        detail: [from && e.toStatus !== "submitted" ? `Was ${from}` : "", e.note ? `“${e.note}”` : ""].filter(Boolean),
      };
    }
    case "status.case":
      return { what: `Case: ${CASE_STATUS[e.toStatus ?? ""] ?? e.toStatus}`, detail: e.note ? [`“${e.note}”`] : undefined };
    case "status.document":
      return { what: `Document: ${e.toStatus}`, detail: e.note ? [`“${e.note}”`] : undefined };
    default:
      return { what: e.action.replace(/[._]/g, " ") };
  }
}

export async function HistoryDrawer({ userId, closeHref }: { userId: string; closeHref: string }) {
  const [user, events] = [await findById(userId), await studentHistory(userId)];

  // Group by calendar day (UTC), newest first, as the query returns them.
  const days: { day: string; items: HistoryEvent[] }[] = [];
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <Link href={closeHref} scroll={false} aria-label="Close history" className="absolute inset-0 bg-[rgb(4_8_20/0.6)] backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden border-l border-line bg-[var(--panel-solid)] shadow-2xl lg:w-[50vw] lg:max-w-[50vw]">
        <header className="border-b border-line px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="history-title" className="text-[1.15rem] font-semibold text-fg-strong">
              History
            </h2>
            <Link href={closeHref} scroll={false} aria-label="Close" data-tip="Close" className="tip tip-end icon-btn">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </Link>
          </div>
          {user && (
            <div className="mt-4">
              <Person id={user.id} name={user.name} sub={`${user.email} · ${events.length} events`} size="md" />
            </div>
          )}
        </header>

        <div className="rail flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {events.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-line p-5 text-[0.9rem] text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-6">
              {days.map((d) => (
                <li key={d.day}>
                  <p className="label mb-2 text-[0.7rem] text-faint">{d.day}</p>
                  <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-[var(--line-strong)]">
                    {d.items.map((e, i) => {
                      const { what, detail } = describe(e);
                      const isStudent = e.actorId === userId;
                      const who = e.actorName ?? "System";
                      return (
                        <li key={`${e.at}-${i}`} className="relative flex gap-3 rounded-[10px] px-1 py-2 hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
                          <span className="relative z-[1] mt-0.5">
                            {e.actorId ? (
                              <Avatar id={e.actorId} name={who} size="sm" />
                            ) : (
                              <span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-[var(--panel-solid)] text-[0.6rem] text-faint">SYS</span>
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[0.9rem] leading-snug text-fg">
                              <strong className="font-semibold">{who}</strong>{" "}
                              <span className="ml-0.5 rounded-full border border-line px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
                                {roleLabel(e.actorRole, isStudent)}
                              </span>{" "}
                              <span className="text-muted">{what}</span>
                            </p>
                            {detail?.map((line) => (
                              <p key={line} className="mt-0.5 whitespace-pre-wrap text-[0.82rem] leading-relaxed text-faint">
                                {line}
                              </p>
                            ))}
                          </div>
                          <time dateTime={e.at} className="shrink-0 pt-0.5 font-mono text-[0.72rem] text-faint" title={new Date(e.at).toLocaleString("en-GB")}>
                            {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </time>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

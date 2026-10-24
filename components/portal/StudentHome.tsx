import Link from "next/link";
import type { Session } from "@/lib/auth/types";
import { loadIntake } from "@/lib/portal/forms";
import { getCases, getDocuments } from "@/lib/portal/data";
import { getIntake } from "@/lib/db/repos/operations";
import { intakeCompletion } from "@/lib/portal/intake";
import { ticksFor } from "@/lib/db/repos/checklist";
import { ADMISSION_CHECKLIST, checklistProgress } from "@/lib/application/checklist";
import { studentMemberNo } from "@/lib/db/repos/student-desk";
import { memberId } from "@/lib/portal/member-id";
import { PortalHeading } from "@/components/portal/Pieces";

/**
 * THE STUDENT'S DASHBOARD (SNZ, 2026-10-24).
 *
 * Four steps in the order a student does them: details, application (with
 * the consent inside it), documents against the checklist, and a message to
 * us when something is unclear. Their student ID and, once the application
 * is in, their case reference sit at the top so they can quote them.
 */
type Step = {
  n: number;
  title: string;
  body: string;
  href: string;
  cta: string;
  state: "done" | "now" | "later";
  meter?: number;
};

export async function StudentHome({ session }: { session: Session }) {
  const [intake, cases, documents, ticked, memberNo, definition] = await Promise.all([
    getIntake(session.userId, "study"),
    getCases(session.userId),
    getDocuments(session.userId),
    ticksFor(session.userId),
    studentMemberNo(session.userId),
    loadIntake("study"),
  ]);

  const answers = (intake?.data ?? {}) as Record<string, unknown>;
  const status = intake?.status ?? null;
  const returned = status === "returned";
  const submitted = Boolean(status && status !== "draft" && !returned);
  const formPercent = intake ? intakeCompletion(definition, intake.data).percent : 0;
  const docs = checklistProgress(ADMISSION_CHECKLIST, String(answers.applyLevel ?? ""), ticked);
  const sentBack = documents.filter((d) => d.status === "rejected" || d.status === "needs_update").length;
  const caseRef = cases.find((c) => c.reference)?.reference ?? null;

  const steps: Step[] = [
    {
      n: 1,
      title: "Your details",
      body: "Photo, phone and where you live. You can change them any time.",
      href: "/portal/profile",
      cta: "View details",
      state: "done",
    },
    {
      n: 2,
      title: "Application form",
      body: returned
        ? "We sent your application back with a note. Please correct it and send it again."
        : submitted
          ? "Sent to us with your signed consent. We will review it and message you."
          : "Fill in the form and sign the consent at the end. It cannot be sent without the consent.",
      href: "/portal/application",
      cta: submitted ? "View application" : formPercent > 0 ? "Continue" : "Start",
      state: submitted ? "done" : "now",
      meter: submitted ? 100 : formPercent,
    },
    {
      n: 3,
      title: "Documents",
      body:
        sentBack > 0
          ? `${sentBack} document${sentBack === 1 ? "" : "s"} sent back to you. Please upload ${sentBack === 1 ? "it" : "them"} again.`
          : `${docs.done} of ${docs.total} ready on the checklist. Upload each one inside the application form.`,
      href: sentBack > 0 ? "/portal/documents" : "/portal/checklist",
      cta: sentBack > 0 ? "Fix documents" : "Open checklist",
      state: docs.total > 0 && docs.done >= docs.total && sentBack === 0 ? "done" : "now",
      meter: docs.percent,
    },
    {
      n: 4,
      title: "Need help?",
      body: "Any problem or question, send us a message. The SnZ team replies here.",
      href: "/portal/messages",
      cta: "Message us",
      state: "later",
    },
  ];

  return (
    <>
      <PortalHeading
        eyebrow="Student portal"
        title={`Hello, ${session.name.split(" ")[0]}`}
        lead="Your file with SnZ Ventures, step by step."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="snz-card flex items-center justify-between gap-4 px-5 py-4">
          <span className="text-[0.85rem] text-muted">Student ID</span>
          <span className="font-mono text-[1rem] font-semibold text-fg-strong">{memberId("student", memberNo)}</span>
        </div>
        <div className="snz-card flex items-center justify-between gap-4 px-5 py-4">
          <span className="text-[0.85rem] text-muted">Case reference</span>
          {caseRef ? (
            <span className="font-mono text-[1rem] font-semibold text-fg-strong">{caseRef}</span>
          ) : (
            <span className="text-right text-[0.82rem] text-faint">Given when you send your application</span>
          )}
        </div>
      </div>

      <ol className="grid gap-3">
        {steps.map((s) => (
          <li key={s.n} className={`snz-card snz-step is-${s.state} flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center`}>
            <span aria-hidden className="snz-step-n flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-bold">
              {s.state === "done" ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                s.n
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.05rem] font-semibold text-fg-strong">
                {s.title}
                {s.state === "done" && <span className="sr-only"> (done)</span>}
              </h2>
              <p className="mt-1 text-[0.9rem] leading-relaxed text-muted">{s.body}</p>
              {s.meter != null && (
                <div className="mt-3 flex max-w-md items-center gap-3">
                  <span className="snz-meter h-1.5 flex-1 overflow-hidden rounded-full">
                    <span className="block h-full rounded-full" style={{ width: `${s.meter}%` }} />
                  </span>
                  <span className="w-10 text-right text-[0.8rem] font-semibold text-muted">{s.meter}%</span>
                </div>
              )}
            </div>
            <Link
              href={s.href}
              className="snz-step-cta inline-flex min-h-10 shrink-0 items-center justify-center rounded-[8px] px-4 text-[0.88rem] font-semibold"
            >
              {s.cta}
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}

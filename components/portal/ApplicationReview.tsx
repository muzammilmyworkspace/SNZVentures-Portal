import { loadIntake } from "@/lib/portal/forms";
import Link from "next/link";
import * as ops from "@/lib/db/repos/operations";
import { findById } from "@/lib/db/repos/users";
import { answerOf } from "@/lib/portal/intake-answers";
import { Person } from "./Avatar";
import { StatusPill } from "./Pieces";
import { ReviewActions } from "./ReviewActions";
import { REVIEW_LABEL } from "@/lib/portal/review-status";
import { EscapeTo } from "./EscapeTo";

/**
 * THE REVIEW WINDOW, opened over the Requests list by `?review=<intake id>`.
 *
 * The whole application, every step and answer, the documents they uploaded
 * and what has been said before; then the decision at the foot. A URL rather
 * than client state, so it survives a reload and can be sent to a colleague.
 *
 * Access is the caller's job: the Requests page is admin only, and the API
 * that records the decision checks again.
 */
export async function ApplicationReview({ intakeId, closeHref }: { intakeId: string; closeHref: string }) {
  const intake = await ops.getIntakeById(intakeId);
  const user = intake ? await findById(intake.userId) : null;

  if (!intake || !user) {
    return (
      <Shell closeHref={closeHref} title="Application not found">
        <p className="text-[0.95rem] text-muted">It may have been removed. Close this and reload the list.</p>
      </Shell>
    );
  }

  const definition = (await loadIntake(intake.pathway));
  const file = await ops.getAdminUserFile(intake.userId, intake.pathway);
  const history = file.history.filter((h) => h.entity === "application" && h.entityId === intake.id);
  const canProceed = intake.status === "submitted" || intake.status === "under_review";
  const canApply = intake.status === "accepted";
  const canReturn = canProceed || canApply;

  return (
    <Shell
      closeHref={closeHref}
      title={`${user.name}'s application`}
      head={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Person id={user.id} name={user.name} sub={user.email} size="lg" />
          <div className="flex items-center gap-3">
            <StatusPill status={intake.status} label={REVIEW_LABEL[intake.status] ?? intake.status} />
            <Link
              href={`/portal/admin/users/${user.id}`}
              className="label text-[0.72rem] text-faint underline-offset-4 hover:text-accent hover:underline"
            >
              Full client file
            </Link>
          </div>
        </div>
      }
      foot={
        canProceed || canReturn || canApply ? (
        <ReviewActions
          intakeId={intake.id}
          studentName={user.name}
          closeHref={closeHref}
          canProceed={canProceed}
          canReturn={canReturn}
          canApply={canApply}
        />
        ) : undefined
      }
    >
      <div className="space-y-7">
        {definition.steps.every((st) => st.fields.every((f) => answerOf(f, intake.data) === null)) && (
          <p className="rounded-[var(--radius-md)] border border-dashed border-line p-4 text-[0.9rem] text-muted">
            No answers are stored on this application. Open the full client file, or ask the student to fill it in.
          </p>
        )}
        {definition.steps.map((step, i) => {
          const answered = step.fields
            .map((f) => ({ f, value: answerOf(f, intake.data) }))
            .filter((x) => x.value !== null);
          if (!answered.length) return null;
          return (
            <section key={step.key}>
              <h3 className="label flex items-center gap-2 text-accent">
                <span className="num text-faint">{String(i + 1).padStart(2, "0")}</span>
                {step.title}
              </h3>
              <dl className="mt-2">
                {answered.map(({ f, value }) => (
                  <div
                    key={f.key}
                    className="grid gap-1 border-b border-line py-2.5 last:border-0 sm:grid-cols-[13rem_1fr] sm:gap-4"
                  >
                    <dt className="text-[0.8rem] text-faint">{f.label}</dt>
                    <dd className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}

        <section>
          <h3 className="label text-accent">Documents uploaded</h3>
          {file.documents.length === 0 ? (
            <p className="mt-2 text-[0.9rem] text-muted">No documents yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {file.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <a
                    href={`/api/portal/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-[0.9rem] text-fg underline-offset-4 hover:text-accent hover:underline"
                  >
                    {d.name}
                    <span className="ml-2 text-[0.78rem] text-faint">{d.category}</span>
                  </a>
                  <StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {history.length > 0 && (
          <section>
            <h3 className="label text-accent">Earlier on this application</h3>
            <ol className="mt-2 space-y-2">
              {history.map((h) => (
                <li key={h.id} className="text-[0.85rem] text-muted">
                  <span className="text-faint">
                    {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>{" "}
                  <strong className="font-semibold text-fg">{REVIEW_LABEL[h.toStatus] ?? h.toStatus}</strong>
                  {h.note && <span>: {h.note}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Shell>
  );
}

function Shell({
  closeHref,
  title,
  head,
  foot,
  children,
}: {
  closeHref: string;
  title: string;
  head?: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <EscapeTo href={closeHref} />
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close the application"
        className="absolute inset-0 bg-[rgb(4_8_20/0.6)] backdrop-blur-[2px]"
      />
      <div className="relative flex h-full w-full max-w-[860px] flex-col border-l border-line bg-[var(--panel-solid)] shadow-2xl">
        <header className="border-b border-line px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="review-title" className="text-[1.15rem] font-semibold text-fg-strong">
              {title}
            </h2>
            <Link
              href={closeHref}
              scroll={false}
              aria-label="Close"
              data-tip="Close"
              className="tip tip-end icon-btn"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </Link>
          </div>
          {head && <div className="mt-4">{head}</div>}
        </header>
        <div className="rail flex-1 overflow-y-auto px-5 py-6 sm:px-7">{children}</div>
        {foot && <footer className="border-t border-line px-5 py-4 sm:px-7">{foot}</footer>}
      </div>
    </div>
  );
}

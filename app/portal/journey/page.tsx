import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { requireOpen } from "@/lib/portal/gate";
import { isDatabaseConfigured } from "@/lib/db/client";
import { studentStage } from "@/lib/portal/stage";
import { STUDENT_FLOW, flowPosition, stateOf, type FlowState } from "@/lib/portal/journey-flow";
import { getIntake } from "@/lib/db/repos/operations";
import { intakeFor, intakeCompletion } from "@/lib/portal/intake";
import { JOURNEYS, type Role } from "@/lib/auth/types";
import { PortalHeading, Panel, JourneyTrack } from "@/components/portal/Pieces";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your journey", robots: { index: false, follow: false } };

const isClientRole = (r: Role): r is "student" | "professional" | "business" =>
  r === "student" || r === "professional" || r === "business";

const TONE: Record<FlowState, { dot: string; card: string; label: string }> = {
  done: {
    dot: "border-moss-400 bg-moss-400 text-navy-950",
    card: "border-line",
    label: "Done",
  },
  current: {
    dot: "border-moss-400 text-accent",
    card: "border-moss-400/50 bg-moss-400/[0.06]",
    label: "Your move",
  },
  waiting: {
    dot: "border-amber-300/70 text-amber-300",
    card: "border-amber-300/40 bg-amber-300/[0.06]",
    label: "With us",
  },
  upcoming: {
    dot: "border-line text-faint",
    card: "border-line opacity-70",
    label: "Later",
  },
};

/**
 * WHERE THIS STUDENT ACTUALLY STANDS.
 *
 * The stages a student can move through themselves are derived from the same
 * rows the gate reads, so this page and the locked links can never disagree.
 * The stages that depend on a university answering are marked as ours to
 * drive, with no invented position — a track that claims progress nobody made
 * is the fastest way to stop being believed.
 */
export default async function JourneyPage() {
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/journey");
  const { session } = await requireUser();

  if (session.role !== "student") {
    const journey = isClientRole(session.role) ? JOURNEYS[session.role] : null;
    return (
      <>
        <PortalHeading
          eyebrow="Your route"
          title="Your journey"
          lead="Each stage, what it involves, and where your case currently sits."
        />
        <Panel title="Stages">
          {journey ? (
            <JourneyTrack stages={journey} current={-1} />
          ) : (
            <p className="text-[0.9rem] text-muted">Journey tracking applies to client accounts.</p>
          )}
        </Panel>
      </>
    );
  }

  const { stage } = isDatabaseConfigured()
    ? await studentStage(session.userId)
    : { stage: "fee_due" as const };

  const position = flowPosition(stage);

  // Only meaningful once the form is open; before that it is always zero and
  // showing it would read as a score.
  const intake = isDatabaseConfigured() ? await getIntake(session.userId, "study") : null;
  const completion =
    position.index >= 2 && intake
      ? intakeCompletion(intakeFor("study"), (intake.data ?? {}) as Record<string, unknown>)
      : null;

  return (
    <>
      <PortalHeading
        eyebrow="Your route"
        title="Your journey"
        lead={position.note}
      />

      <div className="space-y-6">
        <Panel title="Where you are">
          <ol className="space-y-3">
            {STUDENT_FLOW.map((flowStage, i) => {
              const state = stateOf(i, position.index, position.waiting);
              const tone = TONE[state];
              const showAction = state === "current" && flowStage.action;

              return (
                <li
                  key={flowStage.key}
                  className={cn(
                    "flex gap-4 rounded-[var(--radius-md)] border p-4 transition-colors sm:p-5",
                    tone.card
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[0.7rem]",
                      tone.dot
                    )}
                  >
                    {state === "done" ? "✓" : String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="text-[0.98rem] font-semibold text-fg">{flowStage.name}</h3>
                      <span className="label shrink-0 text-[0.6rem] text-faint">
                        {state === "upcoming" && flowStage.advisorLed ? "We handle this" : tone.label}
                      </span>
                    </div>

                    <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">
                      {flowStage.description}
                    </p>

                    {/* The application's own progress, on the stage it belongs to. */}
                    {flowStage.key === "application" && completion && (
                      <div className="mt-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[0.8rem] text-muted">
                            {completion.answered} of {completion.total} required answers
                          </span>
                          <span className="font-mono text-[0.75rem] text-accent">
                            {completion.percent}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-moss-400 transition-[width] duration-500"
                            style={{ width: `${completion.percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {showAction && (
                      <Link
                        href={flowStage.action!.href}
                        className="label mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300"
                      >
                        {flowStage.action!.label}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>

        <Panel title="What we do not guess">
          <p className="text-[0.86rem] leading-relaxed text-muted">
            The first four stages here are read from your own file — your
            receipt, your form, your signature — so they cannot disagree with
            what you can actually open. The last three depend on a university
            answering, and we mark those as ours rather than showing progress
            nobody has made. If you want to know exactly where your case
            stands,{" "}
            <Link href="/portal/messages" className="text-accent underline underline-offset-4">
              ask your advisor
            </Link>{" "}
            and you will get a straight answer.
          </p>
        </Panel>
      </div>
    </>
  );
}

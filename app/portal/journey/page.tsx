import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { requireOpen } from "@/lib/portal/gate";
import { isDatabaseConfigured } from "@/lib/db/client";
import { studentStage } from "@/lib/portal/stage";
import { flowPosition } from "@/lib/portal/journey-flow";
import { FlowTrack } from "@/components/portal/FlowTrack";
import { LiveRefresh } from "@/components/portal/LiveRefresh";
import { getIntake } from "@/lib/db/repos/operations";
import { intakeFor, intakeCompletion } from "@/lib/portal/intake";
import { JOURNEYS, type Role } from "@/lib/auth/types";
import { PortalHeading, Panel, JourneyTrack } from "@/components/portal/Pieces";


export const metadata: Metadata = { title: "Your journey", robots: { index: false, follow: false } };

const isClientRole = (r: Role): r is "student" | "professional" | "business" =>
  r === "student" || r === "professional" || r === "business";

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
      <LiveRefresh />

      <PortalHeading eyebrow="Your route" title="Your journey" lead={position.note} />

      <div className="space-y-6">
        <Panel title="Where you are">
          <FlowTrack
            current={position.index}
            waiting={position.waiting}
            completion={completion}
          />
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

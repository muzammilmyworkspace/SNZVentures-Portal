import { requireUser } from "@/lib/auth/guard";
import { requireOpen } from "@/lib/portal/gate";
import { JOURNEYS, type Role } from "@/lib/auth/types";
import {
  PortalHeading,
  Panel,
  JourneyTrack,
} from "@/components/portal/Pieces";

const isClientRole = (r: Role): r is "student" | "professional" | "business" =>
  r === "student" || r === "professional" || r === "business";

export default async function JourneyPage() {
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/journey");
  const { session } = await requireUser();

  const journey = isClientRole(session.role) ? JOURNEYS[session.role] : null;

  return (
    <>
      <PortalHeading
        eyebrow="Your route"
        title="Your journey"
        lead="Each stage, what it involves, and where your case currently sits."
      />

      {journey ? (
        <Panel title="Stages">
          {/* current = -1 until an advisor sets one. We do not guess. */}
          <JourneyTrack stages={journey} current={-1} />
          <p className="mt-7 border-t border-line pt-5 text-[0.85rem] leading-relaxed text-muted">
            Your advisor marks the current stage as your case moves. Until then
            nothing here is assumed — if you want to know where you stand, ask
            and you will get a straight answer.
          </p>
        </Panel>
      ) : (
        <Panel title="Stages">
          <p className="text-[0.9rem] text-muted">
            Journey tracking applies to client accounts.
          </p>
        </Panel>
      )}

    </>
  );
}

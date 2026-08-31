import { requireRole } from "@/lib/auth/guard";
import { ClientDashboard } from "@/components/portal/ClientDashboard";
import { FeeGate } from "@/components/portal/FeeGate";
import { studentStage } from "@/lib/portal/stage";
import { isDatabaseConfigured } from "@/lib/db/client";

/**
 * Student dashboard.
 *
 * `requireRole` runs on the SERVER and redirects anyone whose session says
 * otherwise, so this URL cannot be used to view another audience's workspace.
 * The role is read from the signed cookie, never from the path.
 *
 * This page is deliberately NOT gated. It is where the fee dialog lives, so
 * locking it would lock the door and leave the key on the inside — and it is
 * where a student redirected away from a locked page lands, which only helps
 * if there is something here that explains why.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string; fee?: string }>;
}) {
  const { session } = await requireRole(["student"], "/portal/student");
  const { locked, fee } = await searchParams;

  const { stage, rejectionNote } = isDatabaseConfigured()
    ? await studentStage(session.userId)
    : { stage: "fee_due" as const, rejectionNote: null };

  return (
    <>
      <FeeGate
        stage={stage}
        rejectionNote={rejectionNote}
        studentName={session.name}
        studentEmail={session.email}
        lockedPath={locked ?? null}
        justSubmitted={fee === "submitted"}
      />
      <ClientDashboard session={session} />
    </>
  );
}

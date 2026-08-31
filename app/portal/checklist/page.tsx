import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { requireOpen } from "@/lib/portal/gate";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getIntake } from "@/lib/db/repos/operations";
import { ticksFor } from "@/lib/db/repos/checklist";
import { ChecklistBoard } from "@/components/application/ChecklistBoard";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";

export const metadata: Metadata = {
  title: "Document checklist",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * THE CHECKLIST, ON ITS OWN PAGE.
 *
 * It began as a section of the application, and that was wrong in one specific
 * way: the application locks the moment it is submitted, so the checklist went
 * read-only at exactly the point it starts to matter. The attestation stamps,
 * the Apostille, the police certificate and the whole visa list all happen
 * after the file has gone in.
 *
 * So it lives here, reads its ticks from their own store, and stays open for
 * as long as somebody needs it. The application still links to it from the
 * section before the uploads, which is where it should be read.
 */
export default async function ChecklistPage() {
  await requireOpen("/portal/checklist");
  const { session } = await requireUser("/portal/checklist");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Documents" title="Document checklist" />
        <NotConfigured what="database" />
      </>
    );
  }

  if (session.role !== "student") {
    return (
      <>
        <PortalHeading eyebrow="Documents" title="Document checklist" />
        <Panel title="Not for this account">
          <p className="text-[0.9rem] text-muted">
            This checklist covers university admission and student visa documents.
          </p>
        </Panel>
      </>
    );
  }

  const [intake, ticks] = await Promise.all([
    getIntake(session.userId, "study"),
    ticksFor(session.userId),
  ]);

  const answers = (intake?.data ?? {}) as Record<string, unknown>;

  return (
    <>
      <PortalHeading
        eyebrow="Documents"
        title="Document checklist"
        lead="Everything we will ask you for, what state each document has to be in, and which stamps it needs. It shows only what applies to what you are applying for."
      />

      <ChecklistBoard
        applyLevel={String(answers.applyLevel ?? "")}
        intake={String(answers.intake ?? "")}
        dependants={String(answers.dependants ?? "")}
        initialTicks={ticks}
      />
    </>
  );
}

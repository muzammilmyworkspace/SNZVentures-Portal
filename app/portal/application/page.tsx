import type { Metadata } from "next";
import { requireOpen } from "@/lib/portal/gate";
import { requireUser } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { IntakeForm } from "@/components/portal/IntakeForm";
import { getIntake } from "@/lib/db/repos/operations";
import { ticksFor } from "@/lib/db/repos/checklist";
import { PATHWAY_FOR_ROLE, intakeFor } from "@/lib/portal/intake";

/** Private. Never indexed — see app/portal/layout.tsx. */
export const metadata: Metadata = { title: "Your application", robots: { index: false, follow: false } };

const LEAD: Record<string, { eyebrow: string; lead: string }> = {
  study: {
    eyebrow: "Admission",
    lead: "Nine short steps. Save at any point and come back — nothing is lost between visits.",
  },
  career: {
    eyebrow: "Career profile",
    lead: "What you have done and where you want to do it next. Save as you go.",
  },
  business: {
    eyebrow: "Business intake",
    lead: "What your company does and what you need from us. Save as you go.",
  },
};

export default async function ApplicationPage() {
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/application");
  const { session } = await requireUser("/portal/application");

  const pathway = PATHWAY_FOR_ROLE[session.role as keyof typeof PATHWAY_FOR_ROLE];

  // Staff have no intake of their own — they read other people's.
  if (!pathway) {
    return (
      <>
        <PortalHeading
          eyebrow="Applications"
          title="Applications"
          lead="Client intake forms are reviewed from the admin area."
        />
        <Panel>
          <p className="text-[0.9rem] leading-relaxed text-muted">
            This page belongs to client accounts. Submitted forms are in{" "}
            <a href="/portal/admin/requests" className="text-accent underline underline-offset-4">
              Requests
            </a>
            .
          </p>
        </Panel>
      </>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow={LEAD[pathway].eyebrow} title="Your application" lead={LEAD[pathway].lead} />
        <NotConfigured />
      </>
    );
  }

  const definition = intakeFor(pathway);
  const form = await getIntake(session.userId, pathway);
  /*
    The checklist ticks come from their own table, not from the form. They have
    to keep working after this locks — see migration 011.
  */
  const checklistTicks = session.role === "student" ? await ticksFor(session.userId) : {};

  return (
    <>
      <PortalHeading
        eyebrow={LEAD[pathway].eyebrow}
        title={definition.title}
        lead={LEAD[pathway].lead}
      />
      <Panel>
        <IntakeForm
          definition={definition}
          initialAnswers={form?.data ?? {}}
          initialStep={form?.step ?? 0}
          checklistTicks={checklistTicks}
          status={form?.status ?? "draft"}
        />
      </Panel>
    </>
  );
}

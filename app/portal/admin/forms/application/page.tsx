import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getFormOverride } from "@/lib/db/repos/forms";
import { intakeFor } from "@/lib/portal/intake";
import { PortalHeading } from "@/components/portal/Pieces";
import { FormBuilder } from "@/components/portal/FormBuilder";

export const metadata: Metadata = { title: "Application form", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE STUDENT APPLICATION FORM, editable. Super admin only.
 *
 * Shows the edited form when one is saved, else the original from code, and
 * hands it to the builder. Saving replaces it for every student at once.
 */
export default async function ApplicationFormPage() {
  await requireSuperAdmin();
  const saved = await getFormOverride("study");
  const definition = saved?.definition?.steps?.length ? saved.definition : intakeFor("study");

  return (
    <>
      <PortalHeading
        eyebrow="Forms"
        title="Application form"
        lead="Add, edit, reorder or delete the questions students answer. Changes reach students as soon as you save; answers already given are kept."
      />
      <FormBuilder
        pathway="study"
        initial={definition}
        edited={saved ? { by: saved.updatedBy, at: saved.updatedAt } : null}
      />
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/portal/AuthShell";
import { AgreementForm } from "@/components/portal/AgreementForm";
import { getSession } from "@/lib/auth/session";
import { currentTemplate, hasSigned } from "@/lib/db/repos/consent-templates";
import { consultantAgreement } from "@/lib/portal/forms";
import { homeFor } from "@/lib/portal/roles";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Consultant agreement",
  description: "Sign the SnZ Ventures consultant agreement.",
  path: "/agreement",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * A consultant signs SnZ Ventures' consultant agreement before using the
 * portal, and again for each new version. Outside /portal so the portal can
 * send them here without a loop.
 */
export default async function AgreementPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/agreement");
  if (session.role !== "advisor" || session.impersonator) redirect(homeFor(session.role));
  const t = await currentTemplate("consultant", null);
  const agreement = await consultantAgreement();
  if (!t || !agreement || (await hasSigned(session.userId, t))) redirect(homeFor(session.role));

  return (
    <AuthShell
      title="One step before you start."
      lead="Read and sign the agreement between you and SnZ Ventures. You will be asked again only when it changes."
    >
      <AgreementForm agreement={agreement} name={session.name} />
    </AuthShell>
  );
}

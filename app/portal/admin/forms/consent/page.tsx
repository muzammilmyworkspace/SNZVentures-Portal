import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { listConsentTemplates, signaturesByVersion, templateVersion } from "@/lib/db/repos/forms";
import { CONSENT_TITLE, CONSENT_VERSION } from "@/lib/portal/consent";
import { isStorageConfigured } from "@/lib/storage";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { ConsentPublisher, ConsentVersions, type ConsentRow } from "@/components/portal/ConsentManager";

export const metadata: Metadata = { title: "Consent form", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE CONSENT STUDENTS SIGN. Super admin only.
 *
 * Write it here or upload the document; whichever is "In use" is what a
 * student reads and signs at the end of their application.
 */
export default async function ConsentFormPage() {
  await requireSuperAdmin();
  const [templates, signed] = await Promise.all([listConsentTemplates(), signaturesByVersion()]);

  const rows: ConsentRow[] = templates.map((t) => ({
    id: t.id,
    version: t.version,
    versionLabel: templateVersion(t),
    title: t.title,
    body: t.body,
    fileUrl: t.fileKey ? `/api/portal/consent-file/${t.id}` : null,
    fileName: t.fileName,
    isCurrent: t.isCurrent,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    signed: signed[templateVersion(t)] ?? 0,
  }));
  const builtInSigned = Object.entries(signed)
    .filter(([v]) => !v.startsWith("custom-"))
    .reduce((n, [, c]) => n + c, 0);

  return (
    <>
      <PortalHeading
        eyebrow="Forms"
        title="Consent form"
        lead="The consent every student signs before their application is sent. Type it or upload the document; publishing makes it the one students sign from now on."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="New version">
          <ConsentPublisher defaultTitle={templates[0]?.title ?? CONSENT_TITLE} storageOn={isStorageConfigured()} />
        </Panel>
        <Panel title="Versions">
          <ConsentVersions
            rows={rows}
            builtIn={{
              title: CONSENT_TITLE,
              version: CONSENT_VERSION,
              signed: builtInSigned,
              isCurrent: !templates.some((t) => t.isCurrent),
            }}
          />
        </Panel>
      </div>
    </>
  );
}

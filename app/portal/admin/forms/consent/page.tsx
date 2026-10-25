import { CONSULTANTS_ENABLED } from "@/lib/portal/features";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import {
  listTemplates,
  signaturesByVersion,
  templateVersion,
  consultantsInUse,
  type ConsentCategory,
  type ConsentTemplate,
} from "@/lib/db/repos/consent-templates";
import { CONSENT_TITLE, CONSENT_VERSION, CONSENT_PARTY } from "@/lib/portal/consent";
import { viewOf } from "@/lib/portal/forms";
import { isStorageConfigured } from "@/lib/storage";
import { PortalHeading, Panel, Tabs, EmptyState } from "@/components/portal/Pieces";
import {
  ConsentNew,
  ConsentEditor,
  ConsentVersions,
  type ConsentRow,
} from "@/components/portal/ConsentManager";
import { ConsentDoc } from "@/components/application/UndertakingDoc";
import { SignersTable } from "@/components/portal/SignersTable";
import { signersOf } from "@/lib/portal/signed-docs";
import { PAYMENT_TERMS_VERSION } from "@/lib/portal/payment-plan";
import { PAYMENT_TERMS_TITLE } from "@/lib/portal/payment-terms";

export const metadata: Metadata = { title: "Consent form", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * CONSENT FORMS.
 *
 * Super admin: AdmitsFair' documents, each with drafts and versions
 *   Students       AdmitsFair <-> student, signed at the end of the application
 *   Payment terms  accepted by each student before choosing a plan and paying
 *   Consultants    AdmitsFair <-> consultant, signed by each consultant at sign-in
 * Under the student consent and the payment terms: everybody who signed, each
 * with their signed PDF (certificate included), also copied to Google Drive.
 * plus a read-only look at what each consultant gives their own students.
 *
 * Consultant: their own consent for their students (with their logo), which
 * their students agree to before submitting the application. They never see
 * AdmitsFair' documents here.
 */

const ALL_TABS: { key: string; label: string; category?: ConsentCategory; lead: string }[] = [
  {
    key: "student",
    label: "Student consent",
    category: "student",
    lead: "Every student signs the active one at the end of their application. If none is active, the original built-in wording is used. Edit makes a new draft; publish it to put it in use.",
  },
  {
    key: "payment",
    label: "Payment terms",
    category: "payment",
    lead: "Every student accepts the active terms before choosing a payment plan and paying the initial fee. Write one term per line. If none is active, the built-in terms are used.",
  },
  {
    key: "consultant",
    label: "AdmitsFair ↔ Consultants",
    category: "consultant",
    lead: "Every consultant must sign the active one when they sign in, and again whenever you publish a new version. None active: nothing to sign.",
  },
  {
    key: "partners",
    label: "Consultants' own",
    lead: "What each consultant asks their own students to agree to. Read only: each consultant manages theirs.",
  },
];
// Only the student consent while the consultant section is off.
const TABS = ALL_TABS.filter((t) => CONSULTANTS_ENABLED || t.key === "student" || t.key === "payment");

async function rowsFor(templates: ConsentTemplate[], category: ConsentCategory): Promise<ConsentRow[]> {
  const signed = await signaturesByVersion(category);
  return templates.map((t) => ({
    id: t.id,
    version: t.version,
    versionLabel: templateVersion(t),
    title: t.title,
    body: t.body,
    status: t.status,
    isCurrent: t.isCurrent,
    logoUrl: t.hasLogo ? `/api/portal/consent-logo/${t.id}?v=${encodeURIComponent(t.updatedAt)}` : null,
    fileUrl: t.fileKey ? `/api/portal/consent-file/${t.id}` : null,
    fileName: t.fileName,
    createdBy: t.createdBy,
    updatedAt: t.updatedAt,
    publishedAt: t.publishedAt,
    signed: signed[templateVersion(t)] ?? 0,
  }));
}

export default async function ConsentFormPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; edit?: string }>;
}) {
  const { session } = await requireRole(["super_admin", "advisor"]);
  const sp = await searchParams;
  const isConsultant = session.role === "advisor";

  const tab = isConsultant ? null : TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const basePath = isConsultant ? "/portal/admin/forms/consent" : `/portal/admin/forms/consent?tab=${tab!.key}`;

  // Consultants' own, read-only, for the super admin.
  if (tab?.key === "partners") {
    const own = await consultantsInUse();
    return (
      <>
        <Heading isConsultant={false} />
        <TabBar active="partners" />
        <p className="mb-5 max-w-3xl text-[0.9rem] text-muted">{tab.lead}</p>
        {own.length === 0 ? (
          <Panel>
            <EmptyState icon="search" title="None yet" body="No consultant has an active consent for their students." />
          </Panel>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {own.map((t) => (
              <Panel key={t.id} title={t.ownerName}>
                <ConsentDoc consent={viewOf(t, t.ownerName)} />
              </Panel>
            ))}
          </div>
        )}
      </>
    );
  }

  const category: ConsentCategory = isConsultant ? "consultant_student" : tab!.category!;
  const ownerId = isConsultant ? session.userId : null;
  const party = isConsultant ? session.name : CONSENT_PARTY;
  const templates = await listTemplates(category, ownerId);
  const rows = await rowsFor(templates, category);
  const editing = sp.edit ? rows.find((r) => r.id === sp.edit && r.status === "draft") ?? null : null;
  const active = rows.find((r) => r.isCurrent) ?? null;

  const builtIn =
    category === "student"
      ? {
          title: CONSENT_TITLE,
          version: CONSENT_VERSION,
          signed: Object.entries(await signaturesByVersion("student"))
            .filter(([v]) => !v.startsWith("custom-"))
            .reduce((n, [, c]) => n + c, 0),
          isCurrent: !active,
        }
      : category === "payment"
        ? {
            title: PAYMENT_TERMS_TITLE,
            version: PAYMENT_TERMS_VERSION,
            signed: (await signaturesByVersion("payment"))[PAYMENT_TERMS_VERSION] ?? 0,
            isCurrent: !active,
          }
        : null;
  const signedKind = category === "student" ? "student_undertaking" : category === "payment" ? "payment_terms" : null;
  const signers = signedKind ? await signersOf(signedKind) : [];

  return (
    <>
      <Heading isConsultant={isConsultant} />
      {!isConsultant && <TabBar active={tab!.key} />}
      <p className="mb-5 max-w-3xl text-[0.9rem] text-muted">
        {isConsultant
          ? "Your students read and agree to the active one before they submit their application, together with AdmitsFair' own. Type it or upload a PDF / Word file, add your logo, check the draft, then publish."
          : tab!.lead}
      </p>

      {editing ? (
        <Panel title={`Editing draft v${editing.version}`}>
          <ConsentEditor row={editing} party={party} closeHref={basePath} />
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Panel title="New consent">
            <ConsentNew
              category={category}
              defaultTitle={active?.title ?? (category === "student" ? CONSENT_TITLE : category === "payment" ? PAYMENT_TERMS_TITLE : category === "consultant" ? "Consultant Agreement" : "Consent")}
              logoInUse={active?.logoUrl ?? null}
              storageOn={isStorageConfigured()}
              basePath={basePath}
            />
          </Panel>
          <Panel title="Versions">
            <ConsentVersions
              rows={rows}
              party={party}
              basePath={basePath}
              builtIn={builtIn}
              pdfBase={category === "student" || category === "payment" ? `/api/admin/consent-preview/${category}` : undefined}
            />
          </Panel>
        </div>
      )}

      {signedKind && !editing && (
        <Panel
          className="mt-6"
          padded={false}
          title={`${category === "payment" ? "Accepted by" : "Signed by"} (${signers.length})`}
          action={
            <a href={`/api/admin/consent-preview/${category}`} target="_blank" rel="noopener" className="text-[0.8rem] font-semibold text-accent-ink hover:underline">
              View the one in use as PDF
            </a>
          }
        >
          <SignersTable kind={signedKind} signers={signers} />
        </Panel>
      )}
    </>
  );
}

function Heading({ isConsultant }: { isConsultant: boolean }) {
  return (
    <PortalHeading
      eyebrow="Forms"
      title={isConsultant ? "Your consent form" : "Consent forms"}
      lead={
        isConsultant
          ? "The consent between you and your students."
          : "Drafts, versions and the one in use for each kind of consent. A published version is never changed: Edit makes a new draft from it, so every signature keeps the words that person read."
      }
    />
  );
}

function TabBar({ active }: { active: string }) {
  return (
    <Tabs
      label="Kind of consent"
      active={active}
      items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/portal/admin/forms/consent?tab=${t.key}` }))}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/portal/roles";
import { applicationFor } from "@/lib/db/repos/consultant-applications";
import { consultantAgreement } from "@/lib/portal/forms";
import { isStorageConfigured } from "@/lib/storage";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { ApplicantForm, ApplicantSign } from "@/components/portal/ApplicantForm";

export const metadata: Metadata = { title: "My application", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A CONSULTANT APPLICANT'S HOME: their application, and where it stands.
 *
 *   draft / rejected   the form (rejected shows why, and can be sent again)
 *   submitted          with SnZ Ventures for review
 *   consent_sent       the consultant agreement, to read and sign here
 *   consent_signed     signed; waiting for the final approval
 * Once approved the account is a consultant and this page sends them home.
 */

const STEPS = ["Fill in", "Review", "Sign agreement", "Approved"];

export default async function ApplicantPage() {
  const { session } = await requireUser("/portal/applicant");
  if (session.role !== "applicant") redirect(homeFor(session.role));

  const app = await applicationFor(session.userId);
  if (!app) {
    return (
      <>
        <PortalHeading eyebrow="Consultant application" title="My application" />
        <NotConfigured />
      </>
    );
  }

  const step =
    app.status === "draft" || app.status === "rejected" ? 0 : app.status === "submitted" ? 1 : app.status === "consent_sent" ? 2 : 3;
  const agreement = app.status === "consent_sent" ? await consultantAgreement() : null;

  return (
    <>
      <PortalHeading
        eyebrow="Consultant application"
        title={`Welcome, ${session.name.split(" ")[0]}`}
        lead="Apply to work with SnZ Ventures as a consultant. Tell us about you and your company; we review it, send you our consultant agreement to sign, and then open your consultant account."
      />

      <ol className="mb-6 grid gap-2 sm:grid-cols-4" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-[0.88rem] ${
              i < step
                ? "border-moss-400/40 bg-moss-400/10 text-fg"
                : i === step
                  ? "border-[var(--accent)] text-fg-strong"
                  : "border-line text-faint"
            }`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold ${i < step ? "bg-moss-400 text-[#070B1A]" : "border border-current"}`}>
              {i < step ? "✓" : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {app.status === "rejected" && app.rejectReason && (
        <div className="note-danger mb-5 p-4 text-[0.9rem] leading-relaxed">
          <strong className="font-semibold">Your application was returned.</strong> {app.rejectReason}
          <span className="mt-1 block text-[0.85rem]">Change what is needed below and submit it again.</span>
        </div>
      )}

      {step === 0 ? (
        <Panel title="Your details">
          <ApplicantForm
            initial={{
              phone: app.phone ?? "",
              address: app.address ?? "",
              city: app.city ?? "",
              country: app.country ?? "",
              companyName: app.companyName ?? "",
              companyRegistered: app.companyRegistered,
              registrationNo: app.registrationNo ?? "",
              website: app.website ?? "",
              about: app.about ?? "",
            }}
            documents={app.documents}
            storageOn={isStorageConfigured()}
          />
        </Panel>
      ) : step === 1 ? (
        <Panel title="With us for review">
          <p className="text-[0.95rem] leading-relaxed text-muted">
            Thank you. Your application reached us on{" "}
            {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "—"}.
            We will email you at <strong className="text-fg">{session.email}</strong> when it has been reviewed.
          </p>
        </Panel>
      ) : step === 2 ? (
        <Panel title="Sign the consultant agreement">
          {agreement ? (
            <ApplicantSign consent={agreement} name={session.name} />
          ) : (
            <p className="text-[0.95rem] text-muted">The agreement is being updated. We will send it to you again shortly.</p>
          )}
        </Panel>
      ) : (
        <Panel title="Almost there">
          <p className="text-[0.95rem] leading-relaxed text-muted">
            Thank you for signing. SnZ Ventures will confirm your consultant account shortly, and we will email you when you can sign in as a consultant.
          </p>
        </Panel>
      )}
    </>
  );
}

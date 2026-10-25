import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { getTemplate, templateVersion } from "@/lib/db/repos/consent-templates";
import { activeConsent } from "@/lib/portal/forms";
import { activePaymentTerms } from "@/lib/portal/payment-terms";
import { contentFor } from "@/lib/portal/signed-docs";
import { buildSignedPdf } from "@/lib/portal/signed-pdf";
import { CONSENT_VERSION } from "@/lib/portal/consent";
import { PAYMENT_TERMS_VERSION } from "@/lib/portal/payment-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A consent or the payment terms as a PDF, unsigned (super admin): the one in
 * use, or one version (?id= a template, ?builtin=1 the built-in wording).
 */
export async function GET(req: Request, { params }: { params: Promise<{ category: string }> }) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { category } = await params;
  if (category !== "student" && category !== "payment") return new NextResponse(null, { status: 404 });
  const kind = category === "student" ? "student_undertaking" : "payment_terms";
  const url = new URL(req.url);

  let version: string;
  const id = url.searchParams.get("id");
  if (id) {
    const t = await getTemplate(id);
    if (!t || t.category !== category) return new NextResponse(null, { status: 404 });
    version = templateVersion(t);
  } else if (url.searchParams.has("builtin")) {
    version = category === "student" ? CONSENT_VERSION : PAYMENT_TERMS_VERSION;
  } else {
    version = category === "student" ? (await activeConsent()).version : (await activePaymentTerms()).version;
  }

  const { pdf } = await buildSignedPdf(await contentFor(kind, version), null);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="AdmitsFair - ${category === "student" ? "Student Consent" : "Payment Terms"} (${version}).pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import * as repo from "@/lib/db/repos/portal";
import * as profilesRepo from "@/lib/db/repos/profiles";
import { findById } from "@/lib/db/repos/users";
import {
  applicationFor,
  moveApplication,
  approveApplication,
} from "@/lib/db/repos/consultant-applications";
import { currentTemplate } from "@/lib/db/repos/consent-templates";
import { sendMail, mailConfigured } from "@/lib/mail";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE SUPER ADMIN'S DECISIONS ON A CONSULTANT APPLICATION.
 *
 *   send_consent   submitted -> consent_sent; the applicant is emailed to sign
 *                  the SnZ Ventures <-> consultant consent in the portal
 *   approve        consent_signed -> approved: the account becomes a
 *                  consultant. Straight from submitted only when no consent
 *                  is in use, since there is then nothing to sign.
 *   reject         any open step -> rejected, with the reason they are sent
 */

async function tell(to: { email: string; name: string }, subject: string, lines: string[]): Promise<boolean> {
  if (!(await mailConfigured())) return false;
  try {
    await sendMail({ to: to.email, subject, text: [`Hello ${to.name},`, "", ...lines, "", "SnZ Ventures"].join("\n") });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[consultant-applications] email failed:", error);
    return false;
  }
}

export async function PATCH(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const body = (await request.json().catch(() => ({}))) as { userId?: string; action?: string; reason?: string };
  const userId = String(body.userId ?? "");
  const user = /^[0-9a-f-]{36}$/i.test(userId) ? await findById(userId) : null;
  const app = user && user.role === "applicant" ? await applicationFor(userId) : null;
  if (!user || !app) return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });

  const login = `${siteUrl()}/login`;
  const ip = clientIp(request);
  const log = (action: "consultant.consent_sent" | "consultant.approved" | "consultant.rejected", meta: Record<string, unknown> = {}) =>
    audit({ action, actorId: session.userId, actorEmail: session.email, entity: "user", entityId: userId, meta, ip });

  if (body.action === "send_consent") {
    const consent = await currentTemplate("consultant", null);
    if (!consent) {
      return NextResponse.json(
        { ok: false, error: "No SnZ ↔ Consultant consent is active. Publish one under Forms → Consent forms first." },
        { status: 409 }
      );
    }
    if (!(await moveApplication(userId, "consent_sent", ["submitted"]))) {
      return NextResponse.json({ ok: false, error: "This application is not waiting for review." }, { status: 409 });
    }
    const emailed = await tell(user, "Your SnZ Ventures consultant application: one step left", [
      "Thank you for applying to work with SnZ Ventures as a consultant.",
      "",
      "We have reviewed your details. Please sign in and read and sign our consultant agreement:",
      login,
      "",
      "Once you have signed it, we will confirm your account.",
    ]);
    await repo.notify({
      userId,
      title: "Please sign the consultant agreement",
      body: "Open your application to read and sign it.",
      href: "/portal/applicant",
      kind: "task",
    });
    await log("consultant.consent_sent", { consent: consent.id, emailed });
    return NextResponse.json({ ok: true, emailed });
  }

  if (body.action === "approve") {
    const consent = await currentTemplate("consultant", null);
    const from: ("consent_signed" | "submitted")[] = consent ? ["consent_signed"] : ["consent_signed", "submitted"];
    if (!(await approveApplication(userId, session.userId, from))) {
      return NextResponse.json(
        {
          ok: false,
          error: consent
            ? "Send the consent first and wait for them to sign it."
            : "This application cannot be approved from its current step.",
        },
        { status: 409 }
      );
    }
    // Their application details become their consultant profile.
    await profilesRepo.saveProfile(userId, "advisor", {
      phone: app.phone ?? "",
      city: app.city ?? "",
      country: app.country ?? "",
      company: app.companyName ?? "",
      address_line: app.address ?? "",
    });
    const emailed = await tell(user, "Welcome to SnZ Ventures: your consultant account is ready", [
      "Your application has been approved. You can now sign in to the portal as a SnZ Ventures consultant:",
      login,
      "",
      "Your consultant code is waiting in the portal. Share it with your students so they are linked to you when they sign up.",
    ]);
    await log("consultant.approved", { emailed });
    return NextResponse.json({ ok: true, emailed });
  }

  if (body.action === "reject") {
    const reason = String(body.reason ?? "").trim().slice(0, 1000);
    if (reason.length < 5) return NextResponse.json({ ok: false, error: "Write the reason; it is sent to them." }, { status: 400 });
    if (!(await moveApplication(userId, "rejected", ["submitted", "consent_sent", "consent_signed"], { decidedBy: session.userId, reason }))) {
      return NextResponse.json({ ok: false, error: "This application is already decided." }, { status: 409 });
    }
    const emailed = await tell(user, "Your SnZ Ventures consultant application", [
      "Thank you for applying to work with SnZ Ventures as a consultant. We are not able to approve your application as it stands:",
      "",
      reason,
      "",
      `You can sign in, change your details and send it again: ${login}`,
    ]);
    await repo.notify({ userId, title: "Your application was returned", body: reason.slice(0, 200), href: "/portal/applicant", kind: "status" });
    await log("consultant.rejected", { emailed });
    return NextResponse.json({ ok: true, emailed });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}

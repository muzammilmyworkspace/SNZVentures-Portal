import { NextResponse } from "next/server";
import { apiRequireStaff } from "@/lib/auth/guard";
import * as fees from "@/lib/db/repos/fees";
import * as repo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { sendMail, mailConfigured } from "@/lib/mail";
import { feeVerifiedEmail, feeRejectedEmail } from "@/lib/mail-templates";
import { siteUrl } from "@/lib/site-url";
import { formatAmount } from "@/lib/portal/payment-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FEE VERIFICATION — the staff decision.
 *
 * This is the single most consequential button in the portal: it is what
 * unlocks the application form, so it is staff-only, rate limited, audited,
 * and it emails the student either way.
 *
 * A REJECTION MUST CARRY A REASON. "There was a problem" with no detail
 * produces a support thread asking what the problem was, and a day lost on
 * both sides. The API refuses a rejection without one rather than leaving that
 * to the UI, because the UI is not the only thing that can call this.
 */
export async function PATCH(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const ip = clientIp(request);
  if (!rateLimit(`feereview:${session.userId}`, { limit: 60, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { id, action, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof id !== "string" || (action !== "verify" && action !== "reject")) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const reason = typeof note === "string" ? note.trim().slice(0, 500) : "";
  if (action === "reject" && reason.length < 5) {
    return NextResponse.json(
      { ok: false, error: "Tell the student what was wrong — they cannot fix it otherwise." },
      { status: 400 }
    );
  }

  /*
    `reviewFeeSubmission` only updates a row still in `submitted`, and returns
    null otherwise. That is what stops two staff in two tabs sending the
    student two contradictory emails about the same payment.
  */
  const updated = await fees.reviewFeeSubmission(
    id,
    action === "verify" ? "verified" : "rejected",
    session.userId,
    reason || null
  );

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "That submission has already been reviewed." },
      { status: 409 }
    );
  }

  await audit({
    action: action === "verify" ? "fee.verified" : "fee.rejected",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "fee_submission",
    entityId: id,
    meta: { student: updated.userId, amount: updated.amount, currency: updated.currency },
    ip,
  });

  // In-portal notification. Independent of email, because email can bounce and
  // this is the message that changes what the student can do next.
  await repo.notify({
    userId: updated.userId,
    kind: "status",
    title:
      action === "verify"
        ? "Fee verified — your application is open"
        : "Your payment receipt needs another look",
    body:
      action === "verify"
        ? "You can now fill in your application form."
        : reason,
    href: action === "verify" ? "/portal/application" : "/portal/student",
  });

  /*
    Email is best effort and must never fail the decision. The verification is
    already recorded and the portal already reflects it; a mail outage should
    not roll that back or show staff an error for something that worked.
  */
  if (mailConfigured()) {
    try {
      const base = siteUrl();
      const mail =
        action === "verify"
          ? feeVerifiedEmail({
              name: updated.studentName,
              portalUrl: base,
              amount: formatAmount(updated.amount, updated.currency),
            })
          : feeRejectedEmail({
              name: updated.studentName,
              portalUrl: base,
              reason,
            });
      await sendMail({
        to: updated.studentEmail,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[fee] ${action} recorded for ${id} but the email failed:`, error);
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[fee] ${action} recorded for ${id} but NOT EMAILED — no mail transport configured.`
    );
  }

  return NextResponse.json({ ok: true, status: updated.status });
}

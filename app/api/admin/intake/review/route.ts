import { NextResponse } from "next/server";
import { apiRequireStaff, isAdmin } from "@/lib/auth/guard";
import * as ops from "@/lib/db/repos/operations";
import * as repo from "@/lib/db/repos/portal";
import { findById } from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { sendMail, mailConfigured } from "@/lib/mail";
import { applicationReturnedEmail, applicationReadyEmail } from "@/lib/mail-templates";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * REVIEW A SUBMITTED APPLICATION.
 *
 *   { intakeId, action: "proceed", note? }  → Ready to apply
 *   { intakeId, action: "return",  note  }  → back to the student to correct
 *
 * Sending it back MUST say what to change: the student cannot fix what they
 * are not told, so the API refuses an empty note rather than leaving that to
 * the button. The note goes to the student (portal notification, email, and
 * the banner on their form), so it is written for them.
 *
 * A consultant may review only their own students; an admin, anyone.
 */
export async function POST(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const ip = clientIp(request);
  if (!rateLimit(`intakereview:${session.userId}`, { limit: 60, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { intakeId, action } = body;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (typeof intakeId !== "string" || (action !== "proceed" && action !== "return")) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (action === "return" && note.length < 5) {
    return NextResponse.json(
      { ok: false, error: "Write what the student should change. They cannot fix it otherwise." },
      { status: 400 }
    );
  }

  const intake = await ops.getIntakeById(intakeId);
  if (!intake) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  if (!isAdmin(session.role)) {
    const mine = await repo.getAssignedClients(session.userId);
    if (!mine.some((c) => c.id === intake.userId)) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
  }

  const updated = await ops.reviewIntake(intakeId, action);
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "This application has already been decided. Reload to see where it is now." },
      { status: 409 }
    );
  }

  await ops.recordStatus({
    entity: "application",
    entityId: intakeId,
    subjectId: intake.userId,
    fromStatus: updated.fromStatus,
    toStatus: updated.status,
    note: note || (action === "proceed" ? "Reviewed and ready to apply." : null),
    actorId: session.userId,
  });

  await audit({
    action: action === "proceed" ? "intake.accepted" : "intake.returned",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "intake",
    entityId: intakeId,
    meta: { student: intake.userId },
    ip,
  });

  await repo.notify({
    userId: intake.userId,
    kind: "status",
    title: action === "proceed" ? "Your application is ready to apply" : "Your application needs a few changes",
    body: action === "proceed" ? note || "We will now start your university applications." : note,
    href: action === "proceed" ? "/portal/journey" : "/portal/application",
  });

  // Email is best effort: the decision is recorded and visible in the portal
  // whether or not the mail goes out.
  const student = await findById(intake.userId);
  if (student && (await mailConfigured())) {
    try {
      const base = siteUrl();
      const mail =
        action === "proceed"
          ? applicationReadyEmail({ name: student.name, portalUrl: base, note: note || null })
          : applicationReturnedEmail({ name: student.name, portalUrl: base, note });
      await sendMail({ to: student.email, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[intake] ${action} recorded for ${intakeId} but the email failed:`, error);
    }
  }

  return NextResponse.json({ ok: true, status: updated.status });
}

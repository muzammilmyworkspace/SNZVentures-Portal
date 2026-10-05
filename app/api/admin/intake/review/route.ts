import { NextResponse } from "next/server";
import { apiRequireStaff, isAdmin } from "@/lib/auth/guard";
import * as ops from "@/lib/db/repos/operations";
import * as repo from "@/lib/db/repos/portal";
import { findById } from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { sendMail, mailConfigured } from "@/lib/mail";
import {
  applicationReturnedEmail,
  applicationReadyEmail,
  applicationAppliedEmail,
  applicationCompletedEmail,
} from "@/lib/mail-templates";
import { siteUrl } from "@/lib/site-url";
import { apiAreaAllowed } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGES = ["submitted", "returned", "accepted", "applied", "completed"] as const;
type Stage = (typeof STAGES)[number];

/**
 * MOVE A SUBMITTED APPLICATION THROUGH THE PIPELINE.
 *
 *   { intakeId, action: "proceed", note? }     review → Ready to apply
 *   { intakeId, action: "applied", note? }     ready → Applied
 *   { intakeId, action: "return",  note  }     back to the student
 *   { intakeId, action: "move", to, note? }    any stage → any stage (the
 *                                              status control on each row)
 *
 * The first three are the buttons in the review window and only move forward
 * from the stage they belong to. "move" is the staff override.
 *
 * Sending it back MUST say what to change, whichever way it is done: the
 * student cannot fix what they are not told. What the student hears (portal
 * notification and email) follows from where the application ends up, not
 * from which control moved it.
 *
 * A consultant may act only on their own students; an admin, on anyone.
 */
export async function POST(request: Request) {
  const guard = await apiRequireStaff();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  {
    const denied = await apiAreaAllowed(guard.session, "applications");
    if (denied) return denied;
  }

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
  const { intakeId, action, to } = body;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (typeof intakeId !== "string" || !["proceed", "return", "applied", "move"].includes(String(action))) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (action === "move" && !STAGES.includes(to as Stage)) {
    return NextResponse.json({ ok: false, error: "Choose where to move it." }, { status: 400 });
  }
  const target: Stage =
    action === "move" ? (to as Stage) : action === "proceed" ? "accepted" : action === "applied" ? "applied" : "returned";

  if (target === "returned" && note.length < 5) {
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

  const updated =
    action === "move"
      ? await ops.moveIntake(intakeId, target)
      : await ops.reviewIntake(intakeId, action as "proceed" | "return" | "applied");
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "It is already there, or someone has just moved it. Reload to see where it is now." },
      { status: 409 }
    );
  }

  const DEFAULT_NOTE: Partial<Record<Stage, string>> = {
    submitted: "Moved back to review.",
    accepted: "Reviewed and ready to apply.",
    applied: "Applied to the universities.",
    completed: "File completed.",
  };
  await ops.recordStatus({
    entity: "application",
    entityId: intakeId,
    subjectId: intake.userId,
    fromStatus: updated.fromStatus,
    toStatus: updated.status,
    note: note || DEFAULT_NOTE[target] || null,
    actorId: session.userId,
  });

  await audit({
    action:
      target === "accepted" ? "intake.accepted"
      : target === "applied" ? "intake.applied"
      : target === "returned" ? "intake.returned"
      : "intake.status_changed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "intake",
    entityId: intakeId,
    meta: { student: intake.userId, from: updated.fromStatus, to: target },
    ip,
  });

  const MESSAGE: Record<Stage, { title: string; body: string; href: string }> = {
    submitted: {
      title: "Your application is being reviewed",
      body: note || "Our team is looking at your application again.",
      href: "/portal/application",
    },
    returned: { title: "Your application needs a few changes", body: note, href: "/portal/application" },
    accepted: {
      title: "Your application is ready to apply",
      body: note || "We will now start your university applications.",
      href: "/portal/journey",
    },
    applied: {
      title: "We have applied to your universities",
      body: note || "We will tell you as soon as the universities reply.",
      href: "/portal/journey",
    },
    completed: {
      title: "Your file is complete",
      body: note || "Everything on your application is done.",
      href: "/portal/journey",
    },
  };
  await repo.notify({ userId: intake.userId, kind: "status", ...MESSAGE[target] });

  // Email is best effort: the move is recorded and visible in the portal
  // whether or not the mail goes out. Moving back to review is internal and
  // sends none.
  const student = await findById(intake.userId);
  if (student && target !== "submitted" && (await mailConfigured())) {
    try {
      const base = siteUrl();
      const opts = { name: student.name, portalUrl: base, note: note || null };
      const mail =
        target === "accepted"
          ? applicationReadyEmail(opts)
          : target === "applied"
            ? applicationAppliedEmail(opts)
            : target === "completed"
              ? applicationCompletedEmail(opts)
              : applicationReturnedEmail({ name: student.name, portalUrl: base, note });
      await sendMail({ to: student.email, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[intake] ${target} recorded for ${intakeId} but the email failed:`, error);
    }
  }

  return NextResponse.json({ ok: true, status: updated.status });
}

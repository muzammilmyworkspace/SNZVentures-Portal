import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { getConsultation, scheduleConsultation, closeConsultation } from "@/lib/db/repos/consultations";
import { notify } from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";
import { sendMail, mailConfigured } from "@/lib/mail";
import { consultationScheduledEmail, consultationCancelledEmail } from "@/lib/mail-templates";
import { siteUrl } from "@/lib/site-url";
import { meetingTime, MODE_LABEL } from "@/lib/portal/meeting-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = ["video", "phone", "office"] as const;

/**
 * THE TEAM'S SIDE OF A CONSULTATION.
 *
 *   { id, action: "schedule", startsAt (ISO), duration, mode, link?, note? }
 *   { id, action: "complete" }
 *   { id, action: "cancel", note? }
 *
 * Scheduling (or moving) and cancelling notify the requester in the portal
 * and email them; the email gives the time in Lithuania and Pakistan.
 */
export async function PATCH(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;
  const before = id ? await getConsultation(id) : null;
  if (!before) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  if (action === "schedule") {
    const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;
    const duration = Math.min(Math.max(Number(body.duration) || 30, 10), 240);
    const mode = MODES.find((m) => m === body.mode) ?? null;
    const link = typeof body.link === "string" && body.link.trim() ? body.link.trim().slice(0, 500) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ ok: false, error: "Choose the day and time." }, { status: 400 });
    }
    if (startsAt.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ ok: false, error: "That time has already passed." }, { status: 400 });
    }
    if (!mode) return NextResponse.json({ ok: false, error: "Choose how you will meet." }, { status: 400 });

    const ok = await scheduleConsultation({
      id,
      startsAt,
      durationMinutes: duration,
      mode,
      meetingLink: link,
      staffNote: note,
      staffId: session.userId,
    });
    if (!ok) return NextResponse.json({ ok: false, error: "This consultation is already closed." }, { status: 409 });

    const moved = before.status === "confirmed";
    const when = meetingTime(startsAt.toISOString());
    await notify({
      userId: before.requesterId,
      kind: "appointment",
      title: moved ? "Your consultation has a new time" : "Your consultation is booked",
      body: `${before.topic}: ${when}`,
      href: "/portal/appointments",
    });
    await audit({
      action: "admin.action",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "appointment",
      entityId: id,
      meta: { consultation: moved ? "moved" : "scheduled", startsAt: startsAt.toISOString() },
      ip: clientIp(request),
    });
    let emailed = false;
    if (await mailConfigured()) {
      try {
        const mail = consultationScheduledEmail({
          name: before.requesterName,
          portalUrl: siteUrl(),
          topic: before.topic,
          when,
          minutes: duration,
          how: MODE_LABEL[mode],
          link,
          note,
          moved,
        });
        await sendMail({ to: before.requesterEmail, subject: mail.subject, text: mail.text, html: mail.html });
        emailed = true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[consultation] scheduled ${id} but the email failed:`, error);
      }
    }
    return NextResponse.json({ ok: true, emailed });
  }

  if (action === "complete" || action === "cancel") {
    const ok = await closeConsultation(id, action === "complete" ? "completed" : "cancelled", note);
    if (!ok) return NextResponse.json({ ok: false, error: "This consultation is already closed." }, { status: 409 });
    if (action === "cancel") {
      await notify({
        userId: before.requesterId,
        kind: "appointment",
        title: "Your consultation has been cancelled",
        body: note ?? before.topic,
        href: "/portal/appointments",
      });
      if (await mailConfigured()) {
        try {
          const mail = consultationCancelledEmail({
            name: before.requesterName,
            portalUrl: siteUrl(),
            topic: before.topic,
            note,
          });
          await sendMail({ to: before.requesterEmail, subject: mail.subject, text: mail.text, html: mail.html });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`[consultation] cancelled ${id} but the email failed:`, error);
        }
      }
    }
    await audit({
      action: "admin.action",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "appointment",
      entityId: id,
      meta: { consultation: action === "complete" ? "completed" : "cancelled" },
      ip: clientIp(request),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
}

import { NextResponse } from "next/server";
import { apiRequireUser, isAdmin } from "@/lib/auth/guard";
import { requestConsultation } from "@/lib/db/repos/consultations";
import { notifyStaff } from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { apiRequireOpen } from "@/lib/portal/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = ["video", "phone", "office"] as const;

/**
 * ASK SNZ VENTURES FOR A CONSULTATION — students (any client) and
 * consultants. The team gets a notification and gives it a time from
 * Consultations; until then it waits as "requested".
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  {
    const locked = await apiRequireOpen(guard.session, "/portal/appointments");
    if (locked) return locked;
  }
  const { session } = guard;
  if (isAdmin(session.role)) {
    return NextResponse.json({ ok: false, error: "Consultations are booked by students and consultants." }, { status: 400 });
  }
  if (!rateLimit(`consult:${session.userId}`, { limit: 6, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many requests. Please wait a while." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const topic = text(body.topic, 120);
  const mode = MODES.find((m) => m === body.mode) ?? null;
  const preferred = text(body.preferred, 300) || null;
  const notes = text(body.notes, 1500) || null;
  if (topic.length < 2) return NextResponse.json({ ok: false, error: "Choose what it is about." }, { status: 400 });
  if (!mode) return NextResponse.json({ ok: false, error: "Choose how you would like to meet." }, { status: 400 });

  const id = await requestConsultation({ requesterId: session.userId, topic, mode, preferred, notes });
  if (!id) return NextResponse.json({ ok: false, error: "We could not save that. Please try again." }, { status: 500 });

  await notifyStaff({
    title: `${session.name} asked for a consultation`,
    body: [topic, preferred ? `Prefers: ${preferred}` : ""].filter(Boolean).join(" · "),
    href: `/portal/appointments?open=${id}`,
    kind: "appointment",
    aboutUserId: session.userId,
    actorId: session.userId,
  });
  await audit({
    action: "appointment.requested",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "appointment",
    entityId: id,
    meta: { topic, mode },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, id });
}

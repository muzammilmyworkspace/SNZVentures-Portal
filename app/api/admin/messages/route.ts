import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { apiAreaAllowed } from "@/lib/auth/permissions";
import { broadcastMessageTo } from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NEW MESSAGE TO ONE PERSON — a student, a consultant or an employee.
 *
 * It goes into that person's own thread with the firm ("Message from SnZ
 * Ventures", made the first time), with a notification, and the response
 * names the thread so the sender is taken straight into it.
 */
export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const denied = await apiAreaAllowed(session, "users");
  if (denied) return denied;

  if (!rateLimit(`newmsg:${session.userId}`, { limit: 40, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down a moment." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ ok: false, error: "Choose who to send it to." }, { status: 400 });
  if (text.length < 1) return NextResponse.json({ ok: false, error: "Write the message first." }, { status: 400 });

  const [conversationId] = await broadcastMessageTo(session.userId, [userId], text);
  if (!conversationId) return NextResponse.json({ ok: false, error: "That person could not be messaged." }, { status: 400 });

  await audit({
    action: "message.sent",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "conversation",
    entityId: conversationId,
    meta: { to: userId, started: true },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, conversationId });
}

import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { broadcastMessage } from "@/lib/db/repos/portal";
import { userIdsForFilter, type UserFilter } from "@/lib/db/repos/users";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SEND ONE MESSAGE TO MANY PEOPLE — admins only.
 *
 *   { userIds: [...], body }            the people ticked on the page
 *   { filter: { role, status, q }, body }  everyone in the current view
 *
 * Each recipient gets it in their own chat (see broadcastMessage), so replies
 * stay private. Capped at 2000 people a send.
 */
export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!rateLimit(`broadcast:${session.userId}`, { limit: 10, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many sends. Wait a few minutes." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
  if (text.length < 2) return NextResponse.json({ ok: false, error: "Write the message first." }, { status: 400 });

  let ids: string[] = [];
  if (Array.isArray(body.userIds)) {
    ids = body.userIds.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 2000);
  } else if (body.filter && typeof body.filter === "object") {
    const f = body.filter as Record<string, unknown>;
    const pick = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    ids = await userIdsForFilter({
      role: pick(f.role) as UserFilter["role"],
      status: pick(f.status) as UserFilter["status"],
      q: pick(f.q),
    });
  }
  if (!ids.length) return NextResponse.json({ ok: false, error: "Choose who to send it to." }, { status: 400 });

  const sent = await broadcastMessage(session.userId, ids, text);
  await audit({
    action: "message.sent",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "broadcast",
    meta: { recipients: sent },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, sent });
}

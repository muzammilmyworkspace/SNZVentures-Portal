import { NextResponse } from "next/server";
import { apiRequireUser, isStaff } from "@/lib/auth/guard";
import * as repo from "@/lib/db/repos/portal";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MESSAGING
 * ---------------------------------------------------------------------------
 * A client talks to SnZ; SnZ talks back. There is no client-to-client channel
 * and no way to construct one — every read and write passes through
 * `canAccessConversation`, which resolves the relationship IN THE DATABASE:
 * the viewer must own the conversation, be the assigned advisor, or be admin.
 *
 * The conversation id arrives from the browser and is therefore untrusted. It
 * is checked on GET as well as POST, because being able to *read* someone
 * else's thread is the same breach as being able to write to it.
 */

const MAX_BODY = 4000;

export async function GET(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const id = new URL(request.url).searchParams.get("conversation");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing conversation." }, { status: 400 });
  }

  if (!(await repo.canAccessConversation(id, session.userId, session.role))) {
    // 404 rather than 403: a probe should not be able to learn that a
    // conversation exists just because it is forbidden.
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const messages = await repo.getMessages(id);
  // Opening a thread marks the other side's messages read — this is what
  // clears the unread badge, so it belongs here rather than in a separate call
  // the UI could forget to make.
  await repo.markConversationRead(id, session.userId);

  return NextResponse.json({ ok: true, messages });
}

export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!rateLimit(`msg:${session.userId}`, { limit: 40, windowMs: 5 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "You're sending messages very quickly. Please wait a moment." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { conversationId, subject, message } = (body ?? {}) as Record<string, unknown>;

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false, error: "Write a message first." }, { status: 400 });
  }
  const text = message.trim().slice(0, MAX_BODY);

  let id: string;

  if (typeof conversationId === "string" && conversationId) {
    if (!(await repo.canAccessConversation(conversationId, session.userId, session.role))) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    id = conversationId;
  } else {
    // Starting a thread. Staff cannot open one from here: a conversation is
    // owned by a client, and inferring which client a staff member meant from
    // an unauthenticated body is exactly how threads end up on the wrong file.
    if (isStaff(session.role)) {
      return NextResponse.json(
        { ok: false, error: "Open the client's case to start a conversation." },
        { status: 400 }
      );
    }
    const created = await repo.createConversation({
      clientId: session.userId, // never from the request body
      subject:
        typeof subject === "string" && subject.trim()
          ? subject.trim().slice(0, 140)
          : "New enquiry",
    });
    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Messaging is unavailable right now." },
        { status: 503 }
      );
    }
    id = created;
  }

  try {
    await repo.postMessage({
      conversationId: id,
      authorId: session.userId,
      body: text,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[messages] send failed:", error);
    return NextResponse.json(
      { ok: false, error: "Your message wasn't sent. Please try again." },
      { status: 503 }
    );
  }

  // Tell the other side. A client messages the desk, not one named person, so
  // notifying assigned staff is handled by the conversation list rather than a
  // per-user fan-out that would need a recipient we do not have here.
  if (isStaff(session.role)) {
    const owner = await repo.conversationOwner(id);
    if (owner) {
      await repo.notify({
        userId: owner,
        title: "New message from SnZ Ventures",
        body: text.slice(0, 160),
        href: "/portal/messages",
        kind: "message",
      });
    }
  }

  await audit({
    action: "message.sent",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "conversation",
    entityId: id,
    // Never the message body — audit logs are not a transcript store.
    meta: { length: text.length },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, conversationId: id });
}

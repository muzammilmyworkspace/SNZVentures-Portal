import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { saveMail, clearMail } from "@/lib/db/repos/mail-settings";
import { sendMail, mailConfig } from "@/lib/mail";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MAIL CREDENTIALS, SET FROM THE PORTAL.
 *
 *   POST   save a key and sender
 *   PUT    send a test message
 *   DELETE forget the stored key
 *
 * SUPER ADMIN ONLY. A sending key can send mail as this firm — to its own
 * clients, from its own domain — which makes it closer to a signing key than
 * to a setting. Whoever holds it can write to anybody in the database as SnZ
 * Ventures, and that is not an ordinary admin's authority.
 *
 * The key is never returned by any method here, including to the person who
 * just saved it. Storage is one-way on purpose: replacing it is the only edit,
 * which is also exactly how a rotation should behave.
 */
export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "The portal database is not configured yet." },
      { status: 503 }
    );
  }

  const ip = clientIp(request);
  if (!rateLimit(`mail-settings:${session.userId}`, { limit: 20, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { apiKey, fromAddress } = (body ?? {}) as Record<string, unknown>;

  if (typeof apiKey !== "string" || apiKey.trim().length < 8) {
    return NextResponse.json({ ok: false, error: "Enter the API key." }, { status: 400 });
  }
  if (typeof fromAddress !== "string" || !fromAddress.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Enter the address messages should come from." },
      { status: 400 }
    );
  }

  /*
    Checked with the provider BEFORE it is stored. Saving a key that does not
    work is how this stays broken quietly: the screen says configured, and the
    next person to use a password reset finds out instead.
  */
  const probe = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    cache: "no-store",
  }).catch(() => null);

  if (!probe) {
    return NextResponse.json(
      { ok: false, error: "Could not reach Resend to check the key. Try again." },
      { status: 502 }
    );
  }
  if (!probe.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Resend rejected that key (${probe.status}). Check it was copied in full from resend.com → API Keys.`,
      },
      { status: 400 }
    );
  }

  const saved = await saveMail({
    apiKey: apiKey.trim(),
    fromAddress: fromAddress.trim(),
    userId: session.userId,
  });
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "We couldn't store that just now." },
      { status: 503 }
    );
  }

  await audit({
    action: "mail.configured",
    actorId: session.userId,
    actorEmail: session.email,
    // The sender, never the key.
    meta: { from: fromAddress.trim() },
    ip,
  });

  return NextResponse.json({ ok: true });
}

/**
 * Send one real message, so "saved" and "works" stop being the same claim.
 *
 * Defaults to the caller's own address: a test that lands in somebody else's
 * inbox proves the same thing and bothers a third party to do it.
 */
export async function PUT(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!rateLimit(`mail-test:${session.userId}`, { limit: 10, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many test messages. Try again shortly." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { to } = (body ?? {}) as Record<string, unknown>;
  const target = typeof to === "string" && to.includes("@") ? to.trim() : session.email;

  const cfg = await mailConfig();
  if (cfg.transport === "none") {
    return NextResponse.json(
      { ok: false, error: "No key is configured yet." },
      { status: 400 }
    );
  }

  try {
    await sendMail({
      to: target,
      subject: "SnZ Ventures portal — test message",
      text: [
        "This is a test message from the SnZ Ventures portal.",
        "",
        `Sent by ${session.name} to confirm that email is working.`,
        `It was sent as: ${cfg.from}`,
        "",
        "If you received this, password resets, email verification and",
        "consultant invitations will all be delivered.",
        "",
        "SnZ Ventures",
      ].join("\n"),
    });
  } catch (error) {
    /*
      The provider's own words, passed through. "Delivery failed" sends
      somebody hunting; "the domain is not verified" tells them what to do.
    */
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "The message did not go out.",
      },
      { status: 502 }
    );
  }

  await audit({
    action: "mail.test_sent",
    actorId: session.userId,
    actorEmail: session.email,
    meta: { to: target },
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true, sentTo: target });
}

export async function DELETE(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  await clearMail();
  await audit({
    action: "mail.cleared",
    actorId: session.userId,
    actorEmail: session.email,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

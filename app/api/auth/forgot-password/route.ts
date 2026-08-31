import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { sendMail, mailConfigured } from "@/lib/mail";
import { authConfigured } from "@/lib/auth/session";
import { audit } from "@/lib/db/repos/audit";
import { siteUrl } from "@/lib/site-url";
import { passwordResetEmail } from "@/lib/mail-templates";

export const runtime = "nodejs";

/**
 * Always returns the same response whether or not the address is registered.
 * An account-existence oracle here is a real privacy leak.
 */
export async function POST(request: Request) {
  const generic = NextResponse.json({
    ok: true,
    message: "If that address has an account, we've sent reset instructions to it.",
  });

  if (!authConfigured() || !store.isStoreReady()) return generic;

  const ip = clientIp(request);
  if (!rateLimit(`forgot:${ip}`, { limit: 5, windowMs: 30 * 60_000 }).ok) return generic;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return generic;
  }

  const { email } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string") return generic;

  const user = await store.findByEmail(email);
  if (!user) return generic;

  try {
    const token = await store.issueToken(user.id, "password_reset", 30);
    const base = siteUrl();
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    await audit({
      action: "auth.password_reset_requested",
      actorId: user.id,
      actorEmail: user.email,
      ip,
    });

    if (mailConfigured()) {
      // Branded HTML with a button, plus the full link as plain text — see
      // lib/mail-templates.ts for why both parts are always sent.
      const mail = passwordResetEmail({ name: user.name, link, minutes: 30 });
      await sendMail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } else {
      // eslint-disable-next-line no-console
      console.info(`[auth] No mail provider configured. Reset link for ${user.email}: ${link}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[forgot-password] failed:", error);
  }

  return generic;
}

/**
 * OUTBOUND EMAIL
 * ---------------------------------------------------------------------------
 * Provider-agnostic, dependency-free. Two transports are supported and both
 * are driven purely by environment variables, so going live is configuration
 * rather than a code change:
 *
 *   RESEND_API_KEY   → Resend REST API
 *   MAIL_WEBHOOK_URL → POST the payload to any endpoint (Zapier, Make, n8n,
 *                      a CRM intake, or your own SMTP relay service)
 *
 * MAIL_FROM   sender address on a domain you control and have verified
 * MAIL_TO     destination (defaults to study@snzventures.com)
 *
 * If neither transport is configured, `sendMail` throws rather than silently
 * discarding the message — a lost enquiry is worse than a visible failure.
 * Callers that must not hard-fail should check `mailConfigured()` first.
 */

import { env, envOr } from "./env";

export type MailMessage = {
  to?: string;
  subject: string;
  /**
   * ALWAYS REQUIRED, even when `html` is supplied.
   *
   * It is the fallback every client falls back to — plain-text readers, screen
   * readers, and the spam filters that penalise HTML-only mail. A password
   * reset that lands in spam is a password reset that did not happen, so the
   * text part carries the full link rather than "view this in a browser".
   */
  text: string;
  /** Optional rich version. Clients that render it get the button. */
  html?: string;
  replyTo?: string;
};

export const DEFAULT_TO = "study@snzventures.com";

/**
 * Used when MAIL_FROM is unset — and almost certainly wrong when it is.
 *
 * Named rather than left inline so the admin diagnostic can show the operator
 * the exact address their messages would go out as. A provider rejecting mail
 * from an address nobody asked it to verify is the failure that survives every
 * other part of the setup being correct.
 */
export const DEFAULT_FROM = "SnZ Ventures <noreply@snzventures.com>";

export type MailConfig = {
  transport: "resend" | "webhook" | "none";
  /** Where it came from, so the admin screen can say which one is in force. */
  source: "environment" | "portal" | "none";
  apiKey: string | null;
  webhookUrl: string | null;
  from: string;
};

/**
 * WHAT WILL ACTUALLY BE USED TO SEND, and where it came from.
 *
 * THE ENVIRONMENT WINS. A variable set on the deployment is a deliberate act
 * by whoever deploys, and a row somebody typed into a form must not silently
 * override it — if both exist, the one that is harder to notice is the one
 * that should lose.
 *
 * Async because the fallback is a database read. Every caller was already in
 * an async context, so nothing was made harder by it, and a synchronous
 * version that quietly ignored stored settings would be worse than no version.
 */
export async function mailConfig(): Promise<MailConfig> {
  const from = envOr("MAIL_FROM", DEFAULT_FROM);

  if (process.env.RESEND_API_KEY) {
    return {
      transport: "resend",
      source: "environment",
      apiKey: process.env.RESEND_API_KEY,
      webhookUrl: null,
      from,
    };
  }
  if (process.env.MAIL_WEBHOOK_URL) {
    return {
      transport: "webhook",
      source: "environment",
      apiKey: null,
      webhookUrl: process.env.MAIL_WEBHOOK_URL,
      from,
    };
  }

  /*
    Imported here rather than at the top: lib/mail is reached from routes that
    have no database at all, and a module-level import would pull the client in
    for every one of them.
  */
  const { liveKey, getStoredMail } = await import("@/lib/db/repos/mail-settings");
  const key = await liveKey();
  if (!key) return { transport: "none", source: "none", apiKey: null, webhookUrl: null, from };

  const stored = await getStoredMail();
  return {
    transport: "resend",
    source: "portal",
    apiKey: key,
    webhookUrl: null,
    // MAIL_FROM still overrides, so a deployment that sets one keeps it.
    from: process.env.MAIL_FROM?.trim() || stored?.fromAddress || DEFAULT_FROM,
  };
}

export async function mailConfigured(): Promise<boolean> {
  return (await mailConfig()).transport !== "none";
}

export async function mailTransport(): Promise<"resend" | "webhook" | "none"> {
  return (await mailConfig()).transport;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const to = message.to ?? env("MAIL_TO") ?? DEFAULT_TO;
  const cfg = await mailConfig();
  const from = cfg.from;

  if (cfg.transport === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const reason = `Resend rejected the message (${res.status}): ${detail.slice(0, 200)}`;
      /*
        Recorded against the stored settings so the admin screen can show the
        provider's own words. Only when the settings came from the portal —
        there is no row to write to otherwise, and an environment-configured
        deployment reports through its logs.
      */
      if (cfg.source === "portal") await noteMailResult(reason);
      throw new Error(reason);
    }

    if (cfg.source === "portal") await noteMailResult(null);
    return;
  }

  if (cfg.transport === "webhook") {
    const res = await fetch(cfg.webhookUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.MAIL_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.MAIL_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({ from, to, ...message }),
    });
    if (!res.ok) {
      throw new Error(`Mail webhook rejected the message (${res.status})`);
    }
    return;
  }

  throw new Error(
    "No mail transport configured. Add a key in Admin -> Integrations, or set " +
      "RESEND_API_KEY on the deployment."
  );
}

/** Kept out of the hot path above so lib/mail stays importable without a database. */
async function noteMailResult(error: string | null): Promise<void> {
  try {
    const { noteResult } = await import("@/lib/db/repos/mail-settings");
    await noteResult(error);
  } catch {
    // Bookkeeping. A message that went out has gone out.
  }
}

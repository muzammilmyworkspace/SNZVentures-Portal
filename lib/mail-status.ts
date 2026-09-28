import "server-only";
import { mailTransport } from "./mail";

/**
 * WHAT THE RUNNING DEPLOYMENT ACTUALLY SEES.
 *
 * "Email is not configured" is a true statement and a useless one: it says the
 * variable is not visible here, and leaves four different causes looking
 * identical — saved to Preview instead of Production, saved but never
 * redeployed, a typo in the NAME, or never saved at all. Every one of them
 * produces the same sentence, so the next move is a guess.
 *
 * scripts/check-config.mjs already answers this, but it answers it about the
 * machine it runs on. The deployment is the only thing that can report its own
 * environment, so this asks it directly and the admin page prints the answer.
 *
 * NOTHING SECRET IS RETURNED. Whether a key exists, yes; the key, never — not
 * a prefix, not a length. A sender address and a list of verified domains are
 * printed on the provider's own dashboard and are not credentials.
 */

export type MailStatus = {
  transport: "resend" | "webhook" | "none";
  /** Present in this environment — not whether it works. */
  hasResendKey: boolean;
  hasWebhook: boolean;
  from: string | null;
  /** Null when there is no key to test with. */
  keyAccepted: boolean | null;
  /** HTTP status Resend replied with, for when it rejects the key. */
  keyStatus: number | null;
  /** Domains Resend will send from, and whether each is verified. */
  domains: { name: string; status: string }[];
  /** Populated only when the check itself could not run. */
  error: string | null;
};

export async function mailStatus(): Promise<MailStatus> {
  const transport = mailTransport();
  const base: MailStatus = {
    transport,
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    hasWebhook: Boolean(process.env.MAIL_WEBHOOK_URL),
    from: process.env.MAIL_FROM?.trim() || null,
    keyAccepted: null,
    keyStatus: null,
    domains: [],
    error: null,
  };

  if (transport !== "resend") return base;

  /*
    A live call, because a key that is present and a key that works are
    different facts and only one of them sends email. A revoked key, a key
    from the wrong Resend account, and a key with a stray space pasted onto
    the end all look exactly like a working one from inside the process.
  */
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      cache: "no-store",
    });
    base.keyStatus = res.status;
    base.keyAccepted = res.ok;

    if (res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { data?: { name?: string; status?: string }[] }
        | null;
      base.domains = (body?.data ?? [])
        .map((d) => ({ name: String(d.name ?? "?"), status: String(d.status ?? "?") }))
        .slice(0, 10);
    }
  } catch (error) {
    base.error = error instanceof Error ? error.message : "The check could not run.";
  }

  return base;
}

/**
 * The sender Resend will be asked to use, and whether its domain is one it
 * will accept.
 *
 * This is the failure that survives everything else being right: the key
 * works, the domain is verified, and mail still bounces because MAIL_FROM is
 * unset and the code falls back to noreply@ on a domain nobody verified.
 */
export function senderDomain(from: string | null): string | null {
  if (!from) return null;
  const match = /<([^>]+)>/.exec(from);
  const address = (match ? match[1] : from).trim();
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

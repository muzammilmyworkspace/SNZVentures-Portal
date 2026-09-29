import "server-only";
import { mailConfig, DEFAULT_FROM } from "./mail";
import { getStoredMail } from "./db/repos/mail-settings";

/**
 * WHAT THE RUNNING DEPLOYMENT ACTUALLY SEES.
 *
 * "Email is not configured" is a true statement and a useless one: it says the
 * setting is not visible here, and leaves several causes looking identical.
 * The deployment is the only thing that can report its own configuration, so
 * this asks it directly and the admin page prints the answer.
 *
 * NOTHING SECRET IS RETURNED. Whether a key exists, yes; the key, never — not
 * a prefix, not a length. A sender address and a list of verified domains are
 * printed on the provider's own dashboard and are not credentials.
 */

export type MailStatus = {
  transport: "resend" | "webhook" | "none";
  /** Environment variable, a key entered in the portal, or nothing. */
  source: "environment" | "portal" | "none";
  from: string | null;
  /** Null when there is no key to test with. */
  keyAccepted: boolean | null;
  /** HTTP status Resend replied with, for when it rejects the key. */
  keyStatus: number | null;
  /** Domains Resend will send from, and whether each is verified. */
  domains: { name: string; status: string }[];
  /** From the stored settings: what went wrong last, and when one last went out. */
  lastError: string | null;
  lastSentAt: string | null;
  /** Populated only when the check itself could not run. */
  error: string | null;
};

export async function mailStatus(): Promise<MailStatus> {
  const cfg = await mailConfig();
  const stored = cfg.source === "portal" ? await getStoredMail() : null;

  const base: MailStatus = {
    transport: cfg.transport,
    source: cfg.source,
    from: cfg.transport === "none" ? null : cfg.from,
    keyAccepted: null,
    keyStatus: null,
    domains: [],
    lastError: stored?.lastError ?? null,
    lastSentAt: stored?.lastSentAt ?? null,
    error: null,
  };

  if (cfg.transport !== "resend" || !cfg.apiKey) return base;

  /*
    A live call, because a key that is present and a key that works are
    different facts and only one of them sends email. A revoked key, a key
    from the wrong Resend account, and a key with a stray space pasted onto
    the end all look exactly like a working one from inside the process.
  */
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
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
 * The sender Resend will be asked to use, and whose domain has to be verified.
 *
 * This is the failure that survives everything else being right: the key
 * works, the domain is verified, and mail still bounces because the sender is
 * on a domain nobody asked Resend to accept.
 */
export function senderDomain(from: string | null): string | null {
  if (!from) return null;
  const match = /<([^>]+)>/.exec(from);
  const address = (match ? match[1] : from).trim();
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

export { DEFAULT_FROM };

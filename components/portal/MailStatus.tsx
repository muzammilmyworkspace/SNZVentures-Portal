import type { MailStatus as Status } from "@/lib/mail-status";
import { senderDomain } from "@/lib/mail-status";
import { DEFAULT_FROM } from "@/lib/mail";

/**
 * Whether this deployment can send email, and if not, which step is missing.
 *
 * Written as a checklist rather than a status badge because the useful output
 * is the NEXT ACTION, not the state. Somebody opens this page having already
 * done four things and been told nothing worked; a green tick against the
 * three that did land is what narrows it down.
 */

function Line({
  ok,
  label,
  detail,
}: {
  ok: boolean | null;
  label: string;
  detail?: React.ReactNode;
}) {
  const mark = ok === null ? "—" : ok ? "✓" : "✗";
  const tone = ok === null ? "text-faint" : ok ? "text-accent" : "text-danger";
  return (
    <li className="flex gap-3 border-b border-line py-2.5 last:border-0">
      <span className={`num w-4 shrink-0 ${tone}`} aria-hidden>
        {mark}
      </span>
      <span className="min-w-0">
        <span className="text-[0.88rem] text-fg">{label}</span>
        {detail && (
          <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-muted">{detail}</span>
        )}
      </span>
    </li>
  );
}

export function MailStatusPanel({ status }: { status: Status }) {
  const from = status.from;
  const domain = senderDomain(from) ?? senderDomain(DEFAULT_FROM);
  const matched = status.domains.find((d) => d.name.toLowerCase() === domain);
  const verified = matched?.status?.toLowerCase() === "verified";

  const working =
    status.transport === "webhook" ||
    (status.keyAccepted === true && Boolean(from) && verified);

  return (
    <div className="space-y-4">
      <p
        className={
          working ? "note-ok p-3 text-[0.88rem]" : "note-warn p-3 text-[0.88rem] leading-relaxed"
        }
      >
        {working
          ? "This deployment can send email."
          : "This deployment cannot send email yet. The first ✗ below is what to fix."}
      </p>

      <ul>
        <Line
          ok={status.hasResendKey || status.hasWebhook}
          label="A mail transport is set on THIS deployment"
          detail={
            status.hasResendKey || status.hasWebhook ? (
              status.hasResendKey ? (
                "RESEND_API_KEY is present."
              ) : (
                "MAIL_WEBHOOK_URL is present."
              )
            ) : (
              <>
                Neither <code>RESEND_API_KEY</code> nor <code>MAIL_WEBHOOK_URL</code> is visible
                to the running code. Three things produce this and they look identical: the
                variable was saved to Preview or Development rather than Production; it was
                saved but the project has not been redeployed since (variables are read at
                build, so saving alone changes nothing); or the name is spelt differently.
                Check the spelling exactly, that Production is ticked, then redeploy.
              </>
            )
          }
        />

        {status.hasResendKey && (
          <Line
            ok={status.keyAccepted}
            label="Resend accepts the key"
            detail={
              status.error
                ? `The check could not run: ${status.error}`
                : status.keyAccepted
                  ? "The key is live."
                  : `Resend replied ${status.keyStatus ?? "nothing"}. The key is wrong, revoked, or belongs to another account — create a new one and replace it.`
            }
          />
        )}

        <Line
          ok={Boolean(from)}
          label="A sender address is set"
          detail={
            from ? (
              <>
                Sending as <strong className="font-semibold text-fg">{from}</strong>
              </>
            ) : (
              <>
                <code>MAIL_FROM</code> is not set, so the code falls back to{" "}
                <code>{DEFAULT_FROM}</code> — an address Resend has almost certainly not been
                asked to verify, so every message is rejected. Set it to the address you want
                replies to go to.
              </>
            )
          }
        />

        {status.keyAccepted === true && (
          <Line
            ok={verified}
            label={`Resend will send from ${domain ?? "that domain"}`}
            detail={
              verified ? (
                "The domain is verified."
              ) : status.domains.length === 0 ? (
                "No domains are set up on this Resend account yet. Add the domain and complete its DNS records."
              ) : (
                <>
                  Not verified. Resend has:{" "}
                  {status.domains.map((d) => `${d.name} (${d.status})`).join(", ")}. The sender
                  domain has to be one of these and it has to say verified.
                </>
              )
            }
          />
        )}
      </ul>

      <p className="text-[0.78rem] leading-relaxed text-faint">
        Read live from this deployment each time the page loads. No key is shown here, only
        whether one is present and whether the provider accepts it.
      </p>
    </div>
  );
}

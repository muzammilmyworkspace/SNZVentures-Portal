import type { MailStatus as Status } from "@/lib/mail-status";
import { senderDomain } from "@/lib/mail-status";
import { MailSetup } from "@/components/portal/MailSetup";

/**
 * Whether this deployment can send email, and if not, which step is missing.
 *
 * A checklist rather than a status badge, because the useful output is the
 * NEXT ACTION. Somebody opens this page having already tried four things and
 * been told nothing worked; the green ticks against the three that did land
 * are what narrows it down.
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

export function MailStatusPanel({
  status,
  canEdit,
}: {
  status: Status;
  /** Entering a sending credential is super-admin work. */
  canEdit: boolean;
}) {
  const domain = senderDomain(status.from);
  const matched = status.domains.find((d) => d.name.toLowerCase() === domain);
  const verified = matched?.status?.toLowerCase() === "verified";

  const working =
    status.transport === "webhook" ||
    (status.keyAccepted === true && Boolean(status.from) && verified);

  return (
    <div className="space-y-4">
      <p
        className={
          working ? "note-ok p-3 text-[0.88rem]" : "note-warn p-3 text-[0.88rem] leading-relaxed"
        }
      >
        {working
          ? status.source === "portal"
            ? "Email is working, using the key entered here."
            : "Email is working, using the deployment's own settings."
          : "Email cannot be sent yet. The first ✗ below is what to fix."}
      </p>

      <ul>
        <Line
          ok={status.transport !== "none"}
          label="A sending key is configured"
          detail={
            status.transport === "none" ? (
              <>
                Nothing is set. Add a Resend API key below — it is stored here, encrypted, and
                takes effect immediately with no redeploy.
              </>
            ) : status.source === "environment" ? (
              <>
                Set on the deployment as an environment variable. That takes priority over
                anything entered here, so the form below is ignored while it exists.
              </>
            ) : (
              "Entered in this portal and stored encrypted."
            )
          }
        />

        {status.transport === "resend" && (
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

        {status.transport !== "none" && (
          <Line
            ok={Boolean(status.from)}
            label="A sender address is set"
            detail={
              status.from ? (
                <>
                  Sending as <strong className="font-semibold text-fg">{status.from}</strong>
                </>
              ) : (
                "No sender address, so every message would be rejected."
              )
            }
          />
        )}

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
                  domain has to be one of these, and it has to say verified.
                </>
              )
            }
          />
        )}
      </ul>

      {/*
        THE PROVIDER'S OWN WORDS about the last failure. A rejection here is
        almost always specific — an unverified sender, a suspended account, a
        daily limit — and repeating it verbatim is more use than any summary.
      */}
      {status.lastError && (
        <p className="note-danger p-3 text-[0.82rem] leading-relaxed">
          Last failure: {status.lastError}
        </p>
      )}
      {status.lastSentAt && !status.lastError && (
        <p className="text-[0.8rem] text-faint">
          Last message sent {new Date(status.lastSentAt).toLocaleString()}.
        </p>
      )}

      {canEdit && <MailSetup source={status.source} canTest={status.transport !== "none"} />}

      <p className="text-[0.78rem] leading-relaxed text-faint">
        Read live from this deployment each time the page loads. No key is shown here — only
        whether one is present and whether the provider accepts it.
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import * as oauth from "@/lib/db/repos/oauth";
import { redirectUriAllowed, SCOPE_OFFLINE, SCOPE_READ } from "@/lib/oauth/server";
import { PortalHeading, Panel } from "@/components/portal/Pieces";

export const metadata: Metadata = { title: "Connect", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * THE CONSENT SCREEN.
 * ---------------------------------------------------------------------------
 * The only place a person decides that something outside this portal may read
 * their clients' files. It sits under /portal so the proxy sends an unsigned-in
 * visitor to sign in first, carrying the whole query string — which means
 * somebody can follow a link from claude.ai, log in, and land back here with
 * the request intact.
 *
 * NOTHING IS REDIRECTED UNTIL THE REQUEST IS PROVEN GOOD. If the client is
 * unknown, or the redirect URI is not one it registered, this page says so and
 * stops. Bouncing to an unverified redirect_uri with an error is how an
 * authorization server becomes an open redirect — the error page is the safe
 * place to fail.
 */

const Stop = ({ title, detail }: { title: string; detail: string }) => (
  <>
    <PortalHeading eyebrow="Connect" title={title} lead={detail} />
    <Panel title="Nothing was connected">
      <p className="text-[0.88rem] leading-relaxed text-muted">
        No access was granted and nothing was changed. If you were setting this up from Claude,
        close this window and start again from the connector screen.
      </p>
    </Panel>
  </>
);

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, role } = await requireUser("/portal");
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const clientId = one("client_id");
  const redirectUri = one("redirect_uri");
  const responseType = one("response_type");
  const challenge = one("code_challenge");
  const challengeMethod = one("code_challenge_method");
  const state = one("state");
  const resource = one("resource");
  const scope = one("scope") ?? SCOPE_READ;

  if (!clientId || !redirectUri) {
    return <Stop title="Something is missing" detail="That link did not carry a client or a return address." />;
  }

  const client = await oauth.getClient(clientId);
  if (!client) {
    return <Stop title="Unknown application" detail="Nothing is registered under that client id." />;
  }

  if (!redirectUriAllowed(redirectUri, client.redirectUris)) {
    /*
      REFUSED HERE RATHER THAN REDIRECTED WITH AN ERROR.

      An unregistered return address is either a misconfiguration or somebody
      trying to have a code delivered somewhere it does not belong. Either way
      the browser must not be sent there.
    */
    return (
      <Stop
        title="That return address is not registered"
        detail="The application asked to be sent somewhere it has not registered, so this was stopped."
      />
    );
  }

  if (responseType !== "code") {
    return <Stop title="Unsupported request" detail="Only the authorization code flow is supported here." />;
  }

  /*
    PKCE IS REQUIRED, NOT PREFERRED. Claude registers as a public client — it
    has nowhere to keep a secret — so the verifier is the only thing that will
    prove the token request came from whoever started this. Without a
    challenge there is nothing to prove it against later.
  */
  if (!challenge || challengeMethod !== "S256") {
    return (
      <Stop
        title="That request is not secure enough"
        detail="It arrived without an S256 code challenge, which is required before access can be granted."
      />
    );
  }

  // Anyone can sign in here; only an admin can grant sight of client files.
  if (role !== "admin" && role !== "super_admin") {
    return (
      <Stop
        title="Your account cannot connect this"
        detail="Only an administrator can give an application access to client files."
      />
    );
  }

  const offline = scope.split(/\s+/).includes(SCOPE_OFFLINE);
  const host = (() => {
    try {
      return new URL(redirectUri).host;
    } catch {
      return redirectUri;
    }
  })();

  return (
    <>
      <PortalHeading
        eyebrow="Connect"
        title={`Let ${client.name} read the portal?`}
        lead={`Signed in as ${session.name} (${session.email}).`}
      />

      <div className="space-y-6">
        <Panel title="What it will be able to do">
          <ul className="space-y-3 text-[0.86rem] leading-relaxed text-muted">
            <li>
              <strong className="font-semibold text-fg">Read every client&rsquo;s file</strong> —
              their application answers, passport and contact details, documents and their review
              status, fee submissions, cases and staff notes.
            </li>
            <li>
              <strong className="font-semibold text-fg">Change nothing.</strong> There is no way
              for it to verify a fee, approve a document, edit a client or write anything at all.
            </li>
            <li>
              <strong className="font-semibold text-fg">Act as you.</strong> Everything it reads is
              recorded against your name, and you can withdraw this from Integrations at any time.
            </li>
            {offline && (
              <li>
                <strong className="font-semibold text-fg">Stay connected</strong> until you
                withdraw it, rather than asking again in an hour.
              </li>
            )}
          </ul>

          {/*
            THE RETURN ADDRESS, SHOWN. The specification asks for it because a
            consent screen that hides where the code is going is one somebody
            can be walked through without ever seeing the destination.
          */}
          <p className="mt-4 rounded-[var(--radius-sm)] border border-line bg-raised p-3 text-[0.82rem] leading-relaxed text-muted">
            You will be returned to <span className="font-mono text-fg">{host}</span>. If that is
            not where you started, press Cancel.
          </p>
        </Panel>

        <Panel title="Your decision">
          <form action="/api/oauth/authorize" method="POST" className="flex flex-wrap gap-3">
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="code_challenge" value={challenge} />
            <input type="hidden" name="scope" value={scope} />
            {state && <input type="hidden" name="state" value={state} />}
            {resource && <input type="hidden" name="resource" value={resource} />}

            <button
              type="submit"
              name="decision"
              value="allow"
              className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
            >
              Allow
            </button>
            <button
              type="submit"
              name="decision"
              value="deny"
              className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5 text-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}

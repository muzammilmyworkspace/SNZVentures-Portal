import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { connectionStatus } from "@/lib/db/repos/drive";
import { driveConfigured, driveRedirectUri, ROOT_FOLDER_NAME } from "@/lib/integrations/drive";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { DriveConnect } from "@/components/portal/DriveConnect";

export const metadata: Metadata = { title: "Integrations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Google Drive is connected." },
  denied: { tone: "bad", text: "Google was not given permission, so nothing was connected." },
  expired: { tone: "bad", text: "That took too long and the request expired. Try again." },
  failed: { tone: "bad", text: "Google refused the exchange. Nothing was saved." },
  norefresh: {
    tone: "bad",
    text:
      "Google did not return a long-lived token, so we could not keep the connection. Remove SnZ Ventures from your Google account's third-party access and connect again.",
  },
  unconfigured: {
    tone: "bad",
    text: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set on this deployment.",
  },
};

/**
 * WHAT THIS DEPLOYMENT IS CONNECTED TO, AND ON WHOSE ACCOUNT.
 *
 * Written so somebody can answer "where do our client files actually go" from
 * one screen — including the scope, because "connected to Google" is not an
 * answer when the question is really "what can it see".
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive?: string }>;
}) {
  await requireAdmin();
  const { drive } = await searchParams;
  const status = await connectionStatus();
  const message = drive ? MESSAGES[drive] : null;

  return (
    <>
      <PortalHeading
        eyebrow="Setup"
        title="Integrations"
        lead="Where client files go when they leave the portal."
      />

      {message && (
        <p
          className={
            message.tone === "ok"
              ? "mb-5 rounded-[var(--radius-sm)] border border-moss-500/40 bg-moss-500/10 p-4 text-[0.88rem] leading-relaxed text-moss-200"
              : "mb-5 rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 p-4 text-[0.88rem] leading-relaxed text-red-200"
          }
        >
          {message.text}
        </p>
      )}

      <div className="space-y-6">
        <Panel title="Google Drive">
          <DriveConnect
            connected={status.connected}
            unreadable={status.unreadable}
            accountEmail={status.accountEmail}
            connectedAt={status.connectedAt}
            configured={driveConfigured()}
            folderName={ROOT_FOLDER_NAME}
          />
        </Panel>

        <Panel title="What it can and cannot do">
          <ul className="space-y-3 text-[0.86rem] leading-relaxed text-muted">
            <li>
              <strong className="font-semibold text-fg">Only files it creates.</strong> The scope
              is <code className="text-fg">drive.file</code>, which grants access to nothing else
              in the account — not existing documents, not attachments, not anything shared with
              you. Everything lands under{" "}
              <span className="text-fg">{ROOT_FOLDER_NAME}</span>.
            </li>
            <li>
              <strong className="font-semibold text-fg">Uploads copy across on their own.</strong>{" "}
              From the moment this is connected, every file a student sends — their fee receipt
              first, then each document — lands in a folder named after them, as it arrives. Staff
              can also send a client&rsquo;s whole file at once, including their answers and the
              signed undertaking, from the client page.
            </li>
            <li>
              <strong className="font-semibold text-fg">A copy, never the copy.</strong> Files are
              in private storage before Drive is touched, and the copy runs after the student has
              already been told their upload worked. Google being slow, or this being disconnected,
              costs them nothing.
            </li>
            <li>
              <strong className="font-semibold text-fg">Shared with named people.</strong> Never
              &ldquo;anyone with the link&rdquo; — that permission is permanent, unattributable and
              one forward from being public. Google emails the person instead, so access can be
              withdrawn and it is always clear who has it.
            </li>
            <li>
              <strong className="font-semibold text-fg">Deleting a client here does not empty
              Drive.</strong> A copy in Drive is a second place their data lives, and an erasure
              request has to be satisfied in both. Nothing removes those files for you.
            </li>
          </ul>
        </Panel>

        <Panel title="If you are setting this up">
          <ol className="space-y-3 text-[0.86rem] leading-relaxed text-muted">
            {[
              <>
                In the Google Cloud console, open the project holding your OAuth client and enable
                the <span className="text-fg">Google Drive API</span>.
              </>,
              <>
                Add this exact redirect URI to that OAuth client:{" "}
                <code className="break-all text-fg">{driveRedirectUri()}</code>
              </>,
              <>
                Add the scope <code className="text-fg">.../auth/drive.file</code> to the consent
                screen. While the app is in testing, add the Google account you will connect as a
                test user.
              </>,
              <>Then press Connect above, signing in as the account whose Drive should hold the files.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[0.62rem] text-faint"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-line pt-4 text-[0.82rem] leading-relaxed text-faint">
            A service account will not work on a personal Gmail account: it has no Drive storage of
            its own, so every upload fails. That is why this connects as you.{" "}
            <Link href="/portal/admin/schema" className="text-accent underline underline-offset-4">
              Database &amp; storage
            </Link>{" "}
            covers the rest of what this deployment is wired to.
          </p>
        </Panel>
      </div>
    </>
  );
}

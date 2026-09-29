import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { RegisterForm, AuthUnavailable } from "@/components/portal/AuthForms";
import { authConfigured, getSession } from "@/lib/auth/session";
import { JoinExisting } from "@/components/portal/JoinExisting";
import { isStaff } from "@/lib/auth/guard";
import { previewInvite } from "@/lib/db/repos/invites";
import { isDatabaseConfigured } from "@/lib/db/client";
import { buildMetadata } from "@/lib/seo";

/*
  NEVER INDEXED, and never rendered from a cache. The path contains a live
  enrolment token: a crawler that reaches it is a token in a search index, and
  a cached render is one student's page served to the next.
*/
export const metadata: Metadata = buildMetadata({
  title: "Join SnZ Ventures",
  description: "Create your SnZ Ventures account.",
  path: "/join",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * ENROLMENT LINK LANDING PAGE.
 *
 * The consultant's name is shown BEFORE the form, because an enrolment nobody
 * checked is how a file ends up owned by the wrong person. A student who does
 * not recognise the name should stop here, and can only do that if we say it.
 *
 * Nothing is spent by opening this page. The invite is claimed by the register
 * request, in the same transaction that writes the assignment — so a link that
 * is opened, left, and opened again still works, and one that is claimed
 * elsewhere in the meantime fails cleanly at submit rather than here.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!authConfigured() || !isDatabaseConfigured()) {
    return (
      <AuthShell title="Not available." lead="This portal is not fully set up yet.">
        <AuthUnavailable />
      </AuthShell>
    );
  }

  const invite = await previewInvite(token);

  /*
    ONE MESSAGE for expired, withdrawn, already used and never existed. They
    are genuinely different, and telling them apart would let somebody feed
    guessed tokens to this page and learn which ones are real.

    It names the way out rather than only the problem: the person holding a
    dead link has a consultant who can issue another one in a few seconds.
  */
  if (!invite) {
    return (
      <AuthShell
        title="This link isn't valid."
        lead="It may have expired, already been used, or been withdrawn."
        footer={
          <p className="text-[0.9rem] text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
              Sign in
            </Link>
          </p>
        }
      >
        <div className="space-y-4">
          <p className="note-danger p-4 text-[0.88rem] leading-relaxed">
            Ask your consultant to send you a new link — they can create one straight away.
          </p>
          <p className="text-[0.85rem] leading-relaxed text-muted">
            If you were not expecting this, you can ignore it. Nothing has been created and
            no account exists until you fill in the form yourself.
          </p>
        </div>
      </AuthShell>
    );
  }

  /*
    ALREADY SIGNED IN.

    Showing a sign-up form to somebody who is already signed in is how you get
    a second account: the conscientious ones sign out, register again, and end
    up with their documents split across two files. So the page offers to
    attach the account they already have.

    Staff are excluded outright. An enrolment link makes its holder somebody's
    CLIENT, and an advisor or admin following one would be asking to be filed
    as a student — `claimInvite` refuses it anyway, but a button that cannot
    work should not be drawn.
  */
  const session = await getSession();

  if (session) {
    return (
      <AuthShell
        title="You're already signed in."
        lead={`${invite.consultantName} sent you this link.`}
        footer={
          <p className="text-[0.9rem] text-muted">
            <Link href="/portal" className="font-semibold text-accent underline underline-offset-4">
              Go to your portal
            </Link>
          </p>
        }
      >
        {isStaff(session.role) ? (
          <p className="note-danger p-4 text-[0.88rem] leading-relaxed">
            You are signed in as a member of staff. Enrolment links are for clients — sign out
            first if you meant to use this one on a client account of your own.
          </p>
        ) : (
          <JoinExisting consultantName={invite.consultantName} token={token} />
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start your journey."
      lead="Two short steps. We only ask for what we need to be useful."
      footer={
        <p className="text-[0.9rem] text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        <p className="note-ok p-4 text-[0.88rem] leading-relaxed">
          <strong className="font-semibold">{invite.consultantName}</strong> has invited you to
          SnZ Ventures. Finish signing up and they will be your consultant.
        </p>

        <RegisterForm invite={token} invitedEmail={invite.email} />

        <p className="text-[0.8rem] leading-relaxed text-faint">
          Not expecting this, or don&rsquo;t recognise that name? Don&rsquo;t continue — close
          this page and tell us at{" "}
          <a
            href="mailto:info@snzventures.com"
            className="underline underline-offset-4 hover:text-fg"
          >
            info@snzventures.com
          </a>
          .
        </p>
      </div>
    </AuthShell>
  );
}

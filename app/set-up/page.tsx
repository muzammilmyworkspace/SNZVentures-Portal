import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { AuthUnavailable } from "@/components/portal/AuthForms";
import { SetUpForm } from "@/components/portal/SetUpForm";
import { authConfigured } from "@/lib/auth/session";
import { userForToken } from "@/lib/auth/store";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Set Up Your Account",
  description: "Finish setting up your SnZ Ventures account.",
  path: "/set-up",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * FIRST SIGN-IN FOR AN ACCOUNT SOMEBODY ELSE CREATED.
 *
 * Reached from the invitation a super admin sends a new consultant. Separate
 * from /reset-password on purpose: that page serves a person who has forgotten
 * their password and must stay one field, while this one also collects the
 * contact details the firm needs before the account is used.
 *
 * The token is read but not spent, so opening the page — or opening it twice —
 * costs nothing. It is consumed by the submission.
 */
export default async function SetUpPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!authConfigured()) {
    return (
      <AuthShell title="Set up your account." lead="A few details, then a password.">
        <AuthUnavailable />
      </AuthShell>
    );
  }

  const account = token ? await userForToken(token, "account_setup") : null;

  /*
    ONE MESSAGE for expired, already used, wrong kind and never existed. It
    names the way out rather than only the problem: whoever holds a dead
    invitation cannot fix it themselves, and the person who can is the one who
    sent it.
  */
  if (!account) {
    return (
      <AuthShell
        title="This invitation has expired."
        lead="Invitations last three days and work once."
      >
        <div className="space-y-5">
          <p className="note-danger p-4 text-[0.88rem] leading-relaxed">
            Ask whoever invited you to send another. It takes them a few seconds, and the new
            link will arrive at the same address.
          </p>
          <p className="text-[0.85rem] leading-relaxed text-muted">
            Already set your password?{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
              Sign in
            </Link>
            .
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set up your account."
      lead="Two short steps: your details, then a password. Nothing is saved until the end."
      footer={
        <p className="text-[0.9rem] text-muted">
          Already done this?{" "}
          <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <SetUpForm token={token ?? ""} name={account.name} email={account.email} />
    </AuthShell>
  );
}

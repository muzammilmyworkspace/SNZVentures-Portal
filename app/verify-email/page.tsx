import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { VerifyEmailConfirm, AuthUnavailable } from "@/components/portal/AuthForms";
import { authConfigured } from "@/lib/auth/session";
import { isTokenValid } from "@/lib/auth/store";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Confirm Your Email",
  description: "Confirm the email address on your SnZ Ventures account.",
  path: "/verify-email",
  noIndex: true,
});

/**
 * THE OTHER HALF OF REGISTRATION.
 *
 * app/api/auth/register emails a link to `/verify-email?token=…`, but this
 * page did not exist — so every confirmation link a new account ever received
 * landed on a 404 and no address could be verified. `proxy.ts` already
 * allowlists this path under PORTAL_ONLY, which is where the route was meant
 * to be all along.
 *
 * The token is CHECKED here and SPENT in the client component, deliberately.
 * Merely opening a page must not consume a single-use token: mail scanners and
 * link previewers fetch URLs out of email before anyone clicks them, and a
 * server-side consume would let them burn the link on the visitor's behalf.
 * Same split, and the same reason, as /reset-password.
 *
 * Dynamic, because the answer depends on a row that changes.
 */
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!authConfigured()) {
    return (
      <AuthShell
        title="Confirm your email."
        lead="One click and your account is ready."
      >
        <AuthUnavailable />
      </AuthShell>
    );
  }

  const valid = token ? await isTokenValid(token, "email_verify") : false;

  if (!valid) {
    return (
      <AuthShell
        title="This link has expired."
        lead="Confirmation links last 24 hours and work once. Sign in and we'll send you a fresh one."
      >
        <div className="space-y-5">
          <p className="rounded-[var(--radius-sm)] border border-line bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] px-4 py-3 text-[0.9rem] leading-relaxed text-muted">
            {token
              ? "This link has already been used, or it's older than 24 hours. If you've already confirmed, you can simply sign in."
              : "That link is missing its confirmation code. Copy the whole link from the email — some mail apps break long links across lines."}
          </p>

          <Link
            href="/login"
            className="label inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
          >
            Sign in
          </Link>

          <p className="text-[0.85rem] text-muted">
            Need an account?{" "}
            <Link href="/register" className="font-semibold text-accent underline underline-offset-4">
              Register
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirm your email."
      lead="One click and your account is ready."
    >
      <VerifyEmailConfirm token={token ?? ""} />
    </AuthShell>
  );
}

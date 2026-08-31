import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { ResetForm, AuthUnavailable } from "@/components/portal/AuthForms";
import { authConfigured } from "@/lib/auth/session";
import { isTokenValid } from "@/lib/auth/store";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Set a New Password",
  description: "Choose a new password for your SnZ Ventures account.",
  path: "/reset-password",
  noIndex: true,
});

/**
 * The token is checked BEFORE the form is drawn.
 *
 * This page used to render its fields for any token at all, so a link that had
 * already been used — or had expired — looked entirely functional. You found
 * out it was dead only after choosing a new password, typing it twice and
 * pressing the button. The API always refused it correctly, so nothing was
 * insecure; it was simply a confusing failure at the moment someone is already
 * locked out and least patient.
 *
 * `isTokenValid` deliberately does not consume the token — merely opening the
 * page must not burn the link.
 *
 * Dynamic, because the answer depends on a row that changes.
 */
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!authConfigured()) {
    return (
      <AuthShell title="Set a new password." lead="Choose something you haven't used elsewhere.">
        <AuthUnavailable />
      </AuthShell>
    );
  }

  const valid = token ? await isTokenValid(token, "password_reset") : false;

  if (!valid) {
    return (
      <AuthShell
        title="This link has expired."
        lead="Reset links last 30 minutes and work once. Request a fresh one and it'll be in your inbox in a moment."
      >
        <div className="space-y-5">
          <p className="rounded-[var(--radius-sm)] border border-line bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] px-4 py-3 text-[0.9rem] leading-relaxed text-muted">
            {token
              ? "This link has already been used, or it's older than 30 minutes."
              : "That link is missing its reset code. Copy the whole link from the email, or request a new one."}
          </p>

          <Link
            href="/forgot-password"
            className="label inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
          >
            Send me a new link
          </Link>

          <p className="text-[0.85rem] text-muted">
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password."
      lead="Choose something you haven't used elsewhere."
    >
      <ResetForm token={token ?? ""} />
    </AuthShell>
  );
}

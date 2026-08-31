import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { ForgotForm, AuthUnavailable } from "@/components/portal/AuthForms";
import { authConfigured } from "@/lib/auth/session";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Reset Your Password",
  description: "Request a password reset for your SnZ Ventures account.",
  path: "/forgot-password",
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password."
      lead="Enter the email on your account and we'll send you a link."
      footer={
        <p className="text-[0.9rem] text-muted">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      }
    >
      {authConfigured() ? <ForgotForm /> : <AuthUnavailable />}
    </AuthShell>
  );
}

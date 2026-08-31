import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { LoginForm, AuthUnavailable } from "@/components/portal/AuthForms";
import { authConfigured } from "@/lib/auth/session";
import { googleConfigured } from "@/lib/auth/oauth";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Client Login",
  description: "Sign in to your SnZ Ventures client portal.",
  path: "/login",
  noIndex: true,
});

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back."
      lead="Sign in to pick up where your journey left off."
      footer={
        <p className="text-[0.9rem] text-muted">
          Don&rsquo;t have an account yet?{" "}
          <Link href="/register" className="font-semibold text-accent underline underline-offset-4">
            Create one
          </Link>
        </p>
      }
    >
      {authConfigured() ? (
        <Suspense fallback={<div className="h-64" aria-hidden />}>
          {/* Server decides whether the Google button exists at all — the
              client is never asked to guess whether OAuth is configured. */}
          <LoginForm googleEnabled={googleConfigured()} />
        </Suspense>
      ) : (
        <AuthUnavailable />
      )}
    </AuthShell>
  );
}

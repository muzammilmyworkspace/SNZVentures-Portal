import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/portal/AuthShell";
import { RegisterForm, AuthUnavailable } from "@/components/portal/AuthForms";
import { authConfigured } from "@/lib/auth/session";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Create Your Account",
  description: "Start your SnZ Ventures journey — study abroad, global careers or business setup.",
  path: "/register",
  noIndex: true,
});

export default function RegisterPage() {
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
      {authConfigured() ? <RegisterForm /> : <AuthUnavailable />}
    </AuthShell>
  );
}

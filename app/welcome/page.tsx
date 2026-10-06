import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/portal/AuthShell";
import { WelcomeForm } from "@/components/portal/WelcomeForm";
import { getSession } from "@/lib/auth/session";
import { mustOnboard } from "@/lib/db/repos/student-desk";
import { homeFor } from "@/lib/portal/roles";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Welcome",
  description: "Finish setting up your SnZ Ventures account.",
  path: "/welcome",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * FIRST SIGN-IN for an account made with a password sent by email (the
 * "Admin" role). Outside /portal so the portal can send people here without
 * sending them round in a circle.
 */
export default async function WelcomePage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/welcome");
  if (!(await mustOnboard(session.userId))) redirect(homeFor(session.role));

  return (
    <AuthShell
      title={`Welcome, ${session.name.split(" ")[0]}.`}
      lead="Add your photo and details, and choose your own password. Then you are in."
    >
      <WelcomeForm name={session.name} email={session.email} />
    </AuthShell>
  );
}

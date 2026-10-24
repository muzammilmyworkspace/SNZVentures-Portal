import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/portal/AuthShell";
import { DetailsForm } from "@/components/portal/DetailsForm";
import { getSession } from "@/lib/auth/session";
import { needsDetails } from "@/lib/db/repos/student-desk";
import { getProfile } from "@/lib/db/repos/profiles";
import { getAvatar } from "@/lib/db/repos/users";
import { homeFor } from "@/lib/portal/roles";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Your details",
  description: "Add your photo and basic details to open your SnZ Ventures portal.",
  path: "/details",
  noIndex: true,
});

export const dynamic = "force-dynamic";

/**
 * A STUDENT'S FIRST STEP (SNZ, 2026-10-24): photo and basic details before
 * the portal opens. Outside /portal so the portal can send people here
 * without a redirect loop.
 */
export default async function DetailsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/details");
  if (session.role !== "student" || !(await needsDetails(session.userId))) redirect(homeFor(session.role));

  const profile = await getProfile(session.userId, session.role);
  const known: Record<string, string> = {};
  for (const k of ["phone", "nationality", "city", "country"]) if (profile[k]) known[k] = profile[k];
  if (await getAvatar(session.userId)) known.hasPhoto = "1";

  return (
    <AuthShell
      title={`Welcome, ${session.name.split(" ")[0]}`}
      lead="Add your photo and a few details. Then your application and document checklist open."
    >
      <DetailsForm name={session.name} email={session.email} known={known} />
    </AuthShell>
  );
}

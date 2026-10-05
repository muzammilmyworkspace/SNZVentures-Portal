import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading } from "@/components/portal/Pieces";
import { ApplicationQueue } from "@/components/portal/ApplicationQueue";

export const metadata: Metadata = {
  title: "Completed",
  robots: { index: false, follow: false },
};

/** Student pipeline: see components/portal/ApplicationQueue for the stages. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pathway?: string; page?: string; review?: string; docs?: string; preview?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Student pipeline" title="Completed" />
        <NotConfigured what="Applications" />
      </>
    );
  }
  return <ApplicationQueue stage="completed" params={params} />;
}

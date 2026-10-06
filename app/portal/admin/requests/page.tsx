import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading } from "@/components/portal/Pieces";
import { ApplicationQueue } from "@/components/portal/ApplicationQueue";
import { requireAreaOrDesk } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Review applications",
  robots: { index: false, follow: false },
};

/** Student pipeline: see components/portal/ApplicationQueue for the stages. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pathway?: string; page?: string; review?: string; docs?: string; preview?: string }>;
}) {
  const params = await searchParams;
  await requireAreaOrDesk("applications", { review: params.review, docs: params.docs });
  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Student pipeline" title="Review applications" />
        <NotConfigured what="Applications" />
      </>
    );
  }
  return <ApplicationQueue stage="review" params={params} />;
}

import type { Metadata } from "next";
import { ConfirmEmailChange } from "@/components/portal/ConfirmEmailChange";

export const metadata: Metadata = {
  title: "Confirm your new email",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The link from the new mailbox lands here.
 *
 * DELIBERATELY OUTSIDE /portal, and unauthenticated. People confirm from
 * whichever device has their mail open, which is very often not the one they
 * are signed in on — and a link that demands a session first would fail for
 * the ordinary case rather than the unusual one. The token is the proof.
 *
 * The token is spent by a button, not by loading the page. Mail scanners and
 * link previewers follow every URL in a message; a change applied on GET would
 * be applied by a security appliance before the person ever saw it.
 */
export default async function ChangeEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-16">
      <ConfirmEmailChange token={token ?? null} />
    </main>
  );
}

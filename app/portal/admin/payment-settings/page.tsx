import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getPaymentSettings } from "@/lib/db/repos/payments";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
import { PaymentSettingsForm } from "@/components/portal/PaymentSettingsForm";

export const metadata: Metadata = { title: "Fees & voucher", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The initial process fee, set by the Super Admin: what each plan costs and
 * the bank details printed on the student's fee voucher. A student's plan
 * keeps the amounts they agreed to; changes here apply to new choices.
 */
export default async function PaymentSettingsPage() {
  await requireSuperAdmin();
  const settings = await getPaymentSettings();
  return (
    <>
      <PortalHeading
        eyebrow="Forms"
        title="Fees & voucher"
        lead="The amounts students see when they choose a payment plan, and the AdmitsFair bank account on their fee voucher."
      />
      <Panel>
        <PaymentSettingsForm initial={settings} />
      </Panel>
    </>
  );
}

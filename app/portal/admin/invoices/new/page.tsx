import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { PortalHeading } from "@/components/portal/Pieces";
import { InvoiceForm } from "@/components/portal/InvoiceForm";

export const metadata: Metadata = { title: "New invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  await requireSuperAdmin();
  return (
    <>
      <PortalHeading
        eyebrow="Billing"
        title="Create an invoice"
        lead="The number is issued when you save, and belongs to this invoice for good."
      />
      <InvoiceForm />
    </>
  );
}

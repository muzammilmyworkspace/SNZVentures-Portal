import "server-only";
import { env, envOr } from "@/lib/env";

/**
 * WHOSE INVOICE THIS IS.
 * ---------------------------------------------------------------------------
 * Kept apart from model.ts so that file stays pure — the form is a client
 * component and imports the money maths, and dragging environment reads into
 * the browser bundle would put a server concern somewhere it cannot work.
 *
 * Read from the environment so an address, a VAT number or a bank line can be
 * changed in the Vercel dashboard without a developer — the same reason the
 * email change and the MCP keys exist. The defaults are what the brand already
 * says (components/brand/Logo.tsx), so an unconfigured deployment still
 * produces a correct document rather than a blank one.
 */
export type Company = {
  name: string;
  address: string;
  email: string;
  site: string;
  vatNumber: string | null;
  registration: string | null;
  payTo: string | null;
};

export function company(): Company {
  return {
    name: envOr("INVOICE_COMPANY_NAME", "SnZ Ventures"),
    address: envOr("INVOICE_COMPANY_ADDRESS", "Vilnius, Lithuania"),
    email: envOr("INVOICE_COMPANY_EMAIL", "info@snzventures.com"),
    site: envOr("INVOICE_COMPANY_SITE", "portal.snzventures.com"),
    /* Printed only when set — an empty VAT line reads as an oversight. */
    vatNumber: env("INVOICE_VAT_NUMBER") ?? null,
    registration: env("INVOICE_COMPANY_REG") ?? null,
    /* Bank or payment details, in their own block. Multi-line. */
    payTo: env("INVOICE_PAYMENT_DETAILS") ?? null,
  };
}

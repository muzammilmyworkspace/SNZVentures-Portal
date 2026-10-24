import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { savePaymentSettings } from "@/lib/db/repos/payments";
import { paymentSettingsFrom } from "@/lib/portal/payment-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Super Admin saves the process-fee amounts and the bank details shown on the voucher. */
export async function PUT(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const settings = paymentSettingsFrom(body);
  if (settings.initialFee <= 0) {
    return NextResponse.json({ ok: false, error: "Enter the initial process fee." }, { status: 400 });
  }

  await savePaymentSettings(settings, session.userId);
  await audit({
    action: "payments.settings_saved",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "portal_settings",
    entityId: "payments",
    meta: { initialFee: settings.initialFee, currency: settings.currency },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, settings });
}

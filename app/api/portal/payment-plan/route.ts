import { NextResponse, after } from "next/server";
import { apiRequireRole } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { choosePlan } from "@/lib/db/repos/payments";
import { type PlanKey } from "@/lib/portal/payment-plan";
import { activePaymentTerms } from "@/lib/portal/payment-terms";
import { recordSigned } from "@/lib/portal/signed-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A student chooses how to pay AdmitsFair's process fee (one-time or
 * installments) and accepts the payment terms. Required before the fee
 * voucher and receipt upload; can be changed until the initial fee is verified.
 */
export async function POST(request: Request) {
  const guard = await apiRequireRole(["student"]);
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (!rateLimit(`plan:${session.userId}`, { limit: 20, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { plan, acceptTerms } = (body ?? {}) as Record<string, unknown>;
  if (plan !== "one_time" && plan !== "installments") {
    return NextResponse.json({ ok: false, error: "Choose a payment plan." }, { status: 400 });
  }
  if (acceptTerms !== true) {
    return NextResponse.json({ ok: false, error: "Please read and accept the terms and conditions." }, { status: 400 });
  }

  const ip = clientIp(request);
  // The terms on screen today: the published version, or the built-in wording.
  const terms = await activePaymentTerms();
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  const saved = await choosePlan(session.userId, plan as PlanKey, ip, terms.version, userAgent).catch(() => null);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "Your fee is already verified, so the plan cannot be changed here. Please contact us." },
      { status: 409 },
    );
  }
  await audit({
    action: "payments.plan_chosen",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { plan, termsVersion: terms.version },
    ip,
  });
  // The accepted terms as a PDF with their certificate, kept and copied to Drive.
  after(() => recordSigned("payment_terms", session.userId));
  return NextResponse.json({ ok: true, plan: saved });
}

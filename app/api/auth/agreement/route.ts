import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { currentTemplate, templateVersion } from "@/lib/db/repos/consent-templates";
import { recordConsent } from "@/lib/db/repos/consents";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { homeFor } from "@/lib/portal/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A consultant signs the consultant agreement in use. The version is taken
 * from the server, never the browser, and only if the one they were shown is
 * still the one in use.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (session.role !== "advisor" || session.impersonator) {
    return NextResponse.json({ ok: false, error: "Only the consultant can sign this." }, { status: 403 });
  }
  if (!rateLimit(`agreement:${session.userId}`, { limit: 10, windowMs: 10 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { id?: string; agree?: boolean; signedName?: string };
  const t = await currentTemplate("consultant", null);
  if (!t) return NextResponse.json({ ok: true, redirectTo: homeFor(session.role) });
  if (body.id !== t.id) {
    return NextResponse.json({ ok: false, error: "The agreement has just changed. Reload the page and read the new one." }, { status: 409 });
  }
  const signedName = String(body.signedName ?? "").trim();
  if (body.agree !== true || signedName.length < 2) {
    return NextResponse.json({ ok: false, error: "Tick the box and type your name to sign." }, { status: 400 });
  }

  const version = templateVersion(t);
  const ok = await recordConsent({
    userId: session.userId,
    kind: "consultant_agreement",
    version,
    signedName,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  if (!ok) return NextResponse.json({ ok: false, error: "We could not record your signature. Please try again." }, { status: 503 });

  await audit({
    action: "consent.accepted",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: session.userId,
    meta: { kind: "consultant_agreement", version, at: "sign_in" },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true, redirectTo: homeFor(session.role) });
}

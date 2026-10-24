import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import { resetClientsAndConsultants } from "@/lib/db/repos/reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Super admin only, and only with the word DELETE typed: removes every
 * student and consultant account and everything they own. Cannot be undone.
 * See lib/db/repos/reset.ts for what is kept.
 */
export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (session.impersonator) {
    return NextResponse.json({ ok: false, error: "Stop viewing as someone else first." }, { status: 403 });
  }
  if (!rateLimit(`reset:${session.userId}`, { limit: 3, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Please wait before trying again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if ((body as { confirm?: unknown })?.confirm !== "DELETE") {
    return NextResponse.json({ ok: false, error: "Type DELETE to confirm." }, { status: 400 });
  }

  try {
    const result = await resetClientsAndConsultants();
    await audit({
      action: "data.reset",
      actorId: session.userId,
      actorEmail: session.email,
      entity: "users",
      entityId: "students+consultants",
      meta: result,
      ip: clientIp(request),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[reset] failed:", error);
    return NextResponse.json({ ok: false, error: "Nothing was deleted: the reset failed. Please try again." }, { status: 500 });
  }
}

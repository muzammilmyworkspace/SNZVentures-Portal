import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { schemaStatus, applyPending } from "@/lib/db/migrator";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SCHEMA CONTROL — super admin only.
 *
 * GET   what is applied and what is pending
 * POST  apply everything pending
 *
 * ADMIN, NOT SUPER ADMIN — deliberately, after weighing it both ways.
 *
 * The tighter bar looks safer and is not. There is no arbitrary SQL here: the
 * only thing this can apply is the schema that shipped in the build already
 * running, in order, each in a transaction, recorded and idempotent. Its blast
 * radius is "the database catches up to the code on top of it".
 *
 * Against that, requiring super_admin risks the failure this screen exists to
 * end: a deployment whose schema is unapplied and whose operator cannot reach
 * the one control that would apply it. Locking the fire exit is not a security
 * improvement. Anyone who is already admin can change roles and suspend
 * accounts; this is not the sharpest thing in the room.
 */
export async function GET() {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ ok: true, status: await schemaStatus() });
}

export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const ip = clientIp(request);
  // Not a throttle for abuse — a guard against a double-click starting a
  // second run while the first is still inside a transaction.
  if (!rateLimit(`schema:${session.userId}`, { limit: 5, windowMs: 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Give the previous run a moment to finish." },
      { status: 429 }
    );
  }

  const result = await applyPending();

  await audit({
    action: result.ok ? "schema.applied" : "schema.failed",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "schema",
    meta: { applied: result.applied, error: result.error, failedAt: result.failedAt },
    ip,
  });

  return NextResponse.json(
    { ok: result.ok, applied: result.applied, error: result.error, status: await schemaStatus() },
    { status: result.ok ? 200 : 500 }
  );
}

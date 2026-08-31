import { NextResponse } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
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
 * SUPER ADMIN, NOT ADMIN. Applying a migration rewrites the shape of every
 * table under it, and unlike the rest of the admin area it cannot be undone
 * from the UI. Ordinary admins manage people and cases; changing the database
 * itself is a narrower privilege on purpose.
 *
 * Migrations are idempotent and recorded, so a second press applies nothing.
 */
export async function GET() {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ ok: true, status: await schemaStatus() });
}

export async function POST(request: Request) {
  const guard = await apiRequireSuperAdmin();
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

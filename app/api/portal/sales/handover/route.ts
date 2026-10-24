import { NextResponse } from "next/server";
import { apiRequireRole } from "@/lib/auth/guard";
import { clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";
import * as sales from "@/lib/db/repos/sales";
import * as repo from "@/lib/db/repos/portal";
import { db, safeQuery } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Push to Super Admin": a sales agent hands their student's case over once
 * the initial fee is verified. The agent keeps a read-only view; every Super
 * Admin is notified to take the case on.
 */
export async function POST(request: Request) {
  const guard = await apiRequireRole(["sales"]);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const { studentId } = (body ?? {}) as Record<string, unknown>;
  if (typeof studentId !== "string" || !studentId) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const student = await sales.handOver(session.userId, studentId);
  if (!student) {
    return NextResponse.json(
      { ok: false, error: "A student can be handed over once their initial fee is verified, and only once." },
      { status: 409 },
    );
  }

  const admins = await safeQuery(
    async () => (await db()`SELECT id FROM users WHERE role = 'super_admin' AND status = 'active'`).map((r) => String(r.id)),
    [] as string[],
  );
  for (const id of admins) {
    await repo.notify({
      userId: id,
      kind: "status",
      title: "New student handed over by sales",
      body: `${session.name} handed over ${student.name} (${student.code}). The initial fee is verified.`,
      href: `/portal/admin/users/${studentId}`,
    });
  }
  await audit({
    action: "sales.handover",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "user",
    entityId: studentId,
    meta: { student: student.code },
    ip: clientIp(request),
  });
  return NextResponse.json({ ok: true });
}

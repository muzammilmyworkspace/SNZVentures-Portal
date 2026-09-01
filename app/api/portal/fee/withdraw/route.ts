import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { withdrawFeeSubmission } from "@/lib/db/repos/fees";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TAKE BACK A RECEIPT WE HAVE NOT LOOKED AT YET.
 *
 * A student sent the wrong slip and had no way to send another: the form
 * refuses a second live submission, correctly, and the only route out was to
 * wait for staff to reject the first. That turns a thirty-second fix into a
 * day, over a photograph.
 *
 * ONLY WHILE IT IS STILL 'submitted'. Once we have verified it, the portal is
 * open on the strength of that declaration and it stops being the student's
 * alone to retract — that conversation goes through an advisor. The rule lives
 * in the WHERE clause of the update rather than in a check here, so it cannot
 * be bypassed by a caller that forgets it.
 *
 * The row is kept and marked withdrawn. It carries a signature and a declared
 * amount; deleting it would destroy the record that the declaration was ever
 * made, and staff looking at three attempts should be able to see three.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (session.role !== "student") {
    return NextResponse.json(
      { ok: false, error: "Fee verification applies to student accounts." },
      { status: 403 }
    );
  }

  if (!rateLimit(`fee-withdraw:${session.userId}`, { limit: 10, windowMs: 30 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  const withdrawn = await withdrawFeeSubmission(session.userId);
  if (!withdrawn) {
    /*
      Nothing to withdraw. Either it has already been checked — in which case
      this is not the student's to undo — or two tabs pressed it at once. The
      message covers the case they can act on.
    */
    return NextResponse.json(
      {
        ok: false,
        error:
          "There is nothing waiting to be withdrawn. If we have already checked your receipt, message your advisor and they will sort it out.",
      },
      { status: 409 }
    );
  }

  await audit({
    action: "fee.withdrawn",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "fee_submission",
    entityId: withdrawn,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

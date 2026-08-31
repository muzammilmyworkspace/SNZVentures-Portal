import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { setTick } from "@/lib/db/repos/checklist";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { ADMISSION_CHECKLIST, VISA_CHECKLIST } from "@/lib/application/checklist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE TICK ON THE DOCUMENT CHECKLIST.
 *
 * Saved on its own rather than with the rest of a form, because the checklist
 * has to keep working after the application locks — which is exactly when the
 * attestation, Apostille and visa items start being ticked.
 *
 * The item id is checked against the list itself. It ends up in a row keyed to
 * a real person, and an endpoint that writes whatever string it is handed is
 * an endpoint that will eventually hold junk nobody can explain.
 */
const KNOWN = new Set(
  [...ADMISSION_CHECKLIST.groups, ...VISA_CHECKLIST.groups].flatMap((g) =>
    g.items.map((i) => i.id)
  )
);

export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  // Generous: this is somebody working down a list, and a run of ticks in
  // quick succession is the normal way to use it.
  if (!rateLimit(`checklist:${session.userId}`, { limit: 120, windowMs: 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Slow down a moment." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { itemId, on } = (body ?? {}) as Record<string, unknown>;
  if (typeof itemId !== "string" || !KNOWN.has(itemId)) {
    return NextResponse.json({ ok: false, error: "Unknown checklist item." }, { status: 400 });
  }

  const saved = await setTick(session.userId, itemId, on === true);
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "We couldn't save that just now." },
      { status: 503 }
    );
  }

  void clientIp(request);
  return NextResponse.json({ ok: true });
}

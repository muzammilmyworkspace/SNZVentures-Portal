import { NextResponse } from "next/server";
import { SEALED_MESSAGE } from "@/lib/auth/impersonation";
import { apiRequireUser } from "@/lib/auth/guard";
import { safeAvatar } from "@/lib/auth/avatar";
import { setAvatar } from "@/lib/db/repos/users";
import { rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set or remove your own profile photo.
 *
 * The same data URI the sign-up form sends, through the same check
 * (safeAvatar). Always the caller's own row: the id comes from the session.
 * Not during a view-as — a photo changed while wearing a client's name would
 * read as theirs.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (session.impersonator) {
    return NextResponse.json({ ok: false, error: SEALED_MESSAGE }, { status: 403 });
  }
  if (!rateLimit(`avatar:${session.userId}`, { limit: 20, windowMs: 15 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many changes. Try again shortly." }, { status: 429 });
  }

  let body: { avatar?: unknown };
  try {
    body = (await request.json()) as { avatar?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (body.avatar === null) {
    await setAvatar(session.userId, null);
    return NextResponse.json({ ok: true });
  }
  const photo = safeAvatar(body.avatar);
  if (!photo) {
    return NextResponse.json({ ok: false, error: "That image could not be used. Try another one." }, { status: 400 });
  }
  await setAvatar(session.userId, photo);
  return NextResponse.json({ ok: true });
}

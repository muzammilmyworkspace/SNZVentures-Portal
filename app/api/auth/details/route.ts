import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { setAvatar, getAvatar } from "@/lib/db/repos/users";
import { safeAvatar } from "@/lib/auth/avatar";
import * as profilesRepo from "@/lib/db/repos/profiles";
import { rateLimit } from "@/lib/auth/rate-limit";
import { homeFor } from "@/lib/portal/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  ["phone", "phone number"],
  ["nationality", "nationality"],
  ["city", "city"],
  ["country", "country"],
] as const;

/**
 * A student's first step (SNZ, 2026-10-24): photo and basic details. An admin
 * viewing as the student may fill it in for them.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ ok: true, redirectTo: homeFor(session.role) });

  if (!rateLimit(`details:${session.userId}`, { limit: 20, windowMs: 15 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  for (const [key, label] of REQUIRED) {
    const value = body[key];
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ ok: false, error: `Enter your ${label}.` }, { status: 400 });
    }
    patch[key] = value.trim().slice(0, 120);
  }

  const avatar = safeAvatar(body.avatar);
  if (!avatar && !(await getAvatar(session.userId))) {
    return NextResponse.json({ ok: false, error: "Add a profile photo to continue." }, { status: 400 });
  }

  await profilesRepo.saveProfile(session.userId, session.role, patch);
  if (avatar) await setAvatar(session.userId, avatar);

  return NextResponse.json({ ok: true, redirectTo: homeFor(session.role) });
}

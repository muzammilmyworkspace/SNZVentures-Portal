import { NextResponse } from "next/server";
import * as store from "@/lib/auth/store";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/db/repos/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!store.isStoreReady()) {
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 });
  }
  if (!rateLimit(`verify:${clientIp(request)}`, { limit: 10, windowMs: 15 * 60_000 }).ok) {
    return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const { token } = (body ?? {}) as Record<string, unknown>;
  if (typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const userId = await store.consumeToken(token, "email_verify");
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "That confirmation link has expired." },
      { status: 400 }
    );
  }

  await store.setEmailVerified(userId);
  const user = await store.findById(userId);
  await audit({
    action: "auth.email_verified",
    actorId: userId,
    actorEmail: user?.email ?? null,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

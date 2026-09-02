import { NextResponse, after } from "next/server";
import * as store from "@/lib/auth/store";
import * as repo from "@/lib/db/repos/portal";
import { apiRequireUser } from "@/lib/auth/guard";
import { PROFILE_FIELDS } from "@/lib/portal/data";

export const runtime = "nodejs";

/**
 * Progressive profile save.
 *
 * The user id always comes from the verified session, never the body. Keys are
 * filtered against PROFILE_FIELDS for the caller's OWN role, and the repository
 * filters again against the real column whitelist — so a client cannot write
 * another pathway's schema, another user's row, or their own role.
 */
export async function POST(request: Request) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  if (!store.isStoreReady()) {
    return NextResponse.json(
      { ok: false, error: "The portal database is not configured yet." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const incoming = (body as { profile?: Record<string, unknown> })?.profile;
  if (typeof incoming !== "object" || incoming === null) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const allowed = new Set((PROFILE_FIELDS[session.role] ?? []).map((f) => f.key));
  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!allowed.has(key)) continue;
    if (typeof value !== "string") continue;
    patch[key] = value;
  }

  try {
    await store.saveProfile(session.userId, session.role, patch);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[profile] save failed:", error);
    return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  }

  /*
    Once an hour at most, not once per save. This form autosaves as somebody
    types; the useful signal is "they were working on their details", not
    forty rows saying so. The fields themselves are on their file, which is
    where anybody who cares which one changed will look.
  */
  after(
    repo.notifyStaff({
      title: `${session.name} updated their details`,
      body: Object.keys(patch).join(", ").slice(0, 200) || undefined,
      href: `/portal/admin/users/${session.userId}`,
      kind: "general",
      aboutUserId: session.userId,
      actorId: session.userId,
      dedupeWithinMinutes: 60,
    })
  );

  return NextResponse.json({ ok: true });
}

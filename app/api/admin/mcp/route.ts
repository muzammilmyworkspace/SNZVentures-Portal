import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import * as tokens from "@/lib/db/repos/mcp-tokens";
import { audit } from "@/lib/db/repos/audit";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ISSUING AND WITHDRAWING A PERSONAL MCP KEY.
 *
 * Both halves are scoped to whoever is signed in. There is no user id in the
 * request body — an admin creates a key for themselves and revokes their own,
 * and no combination of parameters can address anybody else's.
 */

export async function POST(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  /*
    A key is a thing somebody creates once and then rarely. This limit is not
    about load: it is about a stuck button or an impatient click producing
    twenty live keys, each of which can read every client's file and each of
    which then has to be found and withdrawn.
  */
  if (!rateLimit(`mcp-token:${session.userId}`, { limit: 10, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json(
      { ok: false, error: "That is a lot of keys in an hour. Try again later." },
      { status: 429 }
    );
  }

  let label = "";
  try {
    const body = (await request.json()) as { label?: unknown };
    label = typeof body.label === "string" ? body.label : "";
  } catch {
    // A key with no label is still a key. Failing the request over a missing
    // name would be refusing to do the thing for the sake of the paperwork.
  }

  const live = await tokens.list(session.userId);
  if (live.length >= 10) {
    return NextResponse.json(
      { ok: false, error: "You already have ten keys. Withdraw one before creating another." },
      { status: 409 }
    );
  }

  const { token, row } = await tokens.issue(session.userId, label || "My computer");

  await audit({
    action: "mcp.token_issued",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "mcp_token",
    entityId: row.id,
    // The label and the id, never the key. The audit helper strips
    // token-shaped keys as a backstop; the rule is enforced here.
    meta: { label: row.label },
    ip: clientIp(request),
  });

  /*
    THE ONLY TIME THIS VALUE EXISTS OUTSIDE A HASH. It is not stored, and there
    is no endpoint that can return it again — if this response is lost, the key
    is withdrawn and a new one made.
  */
  return NextResponse.json({ ok: true, token, row });
}

export async function DELETE(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which key?" }, { status: 400 });

  const done = await tokens.revoke(id, session.userId);
  if (!done) {
    // Same answer whether it never existed, belongs to somebody else, or was
    // already withdrawn — none of which is this person's business to learn.
    return NextResponse.json({ ok: false, error: "No such key." }, { status: 404 });
  }

  await audit({
    action: "mcp.token_revoked",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "mcp_token",
    entityId: id,
    ip: clientIp(request),
  });

  return NextResponse.json({ ok: true });
}

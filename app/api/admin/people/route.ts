import { NextResponse } from "next/server";
import { apiRequireAdmin } from "@/lib/auth/guard";
import { apiAreaAllowed } from "@/lib/auth/permissions";
import { db, safeQuery } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FIND A PERSON, for "New message": up to 12 matches on name or email, with
 * what they are, so the picker can show who is who. Admins with the Users
 * area only.
 */
export async function GET(request: Request) {
  const guard = await apiRequireAdmin();
  if (!guard.ok) return guard.response;
  const denied = await apiAreaAllowed(guard.session, "users");
  if (denied) return denied;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ ok: true, people: [] });

  const people = await safeQuery(async () => {
    const rows = await db()`
      SELECT id, name, email, role::text AS role, member_no,
             CASE WHEN avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM updated_at))::int END AS avatar_v
        FROM users
       WHERE id <> ${guard.session.userId}
         AND (name ILIKE ${"%" + q + "%"} OR email ILIKE ${"%" + q + "%"})
       ORDER BY name
       LIMIT 12
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      role: String(r.role),
      memberNo: r.member_no == null ? null : Number(r.member_no),
      avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
    }));
  }, []);
  return NextResponse.json({ ok: true, people });
}

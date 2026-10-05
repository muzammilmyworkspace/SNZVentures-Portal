import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { getAvatar } from "@/lib/db/repos/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A PERSON'S PROFILE PHOTO, served as an image.
 *
 * Photos live on the user row as small data URIs (see AvatarPicker). Putting
 * them straight into a list page would add ~20KB of base64 per row to the
 * HTML, so lists ask for `/api/avatar/<id>?v=<updated>` instead and the
 * browser caches each one. `v` changes when the photo does.
 *
 * Signed-in users only. A Google photo is a URL already, so it is a redirect.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const value = await getAvatar(id);
  if (!value) return new NextResponse(null, { status: 404 });

  if (/^https:\/\//.test(value)) return NextResponse.redirect(value);

  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(value);
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

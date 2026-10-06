import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { getConsentLogo } from "@/lib/db/repos/forms";

/**
 * The logo at the head of a consent version, for anyone signed in. A version
 * never changes once published, so the image can be cached.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const logo = await getConsentLogo(id);
  if (!logo) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.type,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

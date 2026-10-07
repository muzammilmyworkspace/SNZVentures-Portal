import { NextResponse } from "next/server";
import { apiRequireUser } from "@/lib/auth/guard";
import { getTemplate } from "@/lib/db/repos/consent-templates";
import { getSignedUrl } from "@/lib/storage";

/**
 * The consent document, for anyone signed in: it is what students are asked
 * to read before they sign, so every account may open it. Short-lived link.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiRequireUser();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const t = await getTemplate(id);
  if (!t?.fileKey) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  // A draft is seen only by whoever manages it.
  const { session } = guard;
  if (t.status === "draft" && !(session.role === "super_admin" || (t.ownerId && t.ownerId === session.userId))) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  try {
    const url = await getSignedUrl(t.fileKey, 300, t.fileProvider as never);
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[consent-file]", error);
    return NextResponse.json({ ok: false, error: "The document could not be opened." }, { status: 502 });
  }
}

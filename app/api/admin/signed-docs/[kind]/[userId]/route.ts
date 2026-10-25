import { NextResponse, after } from "next/server";
import { apiRequireSuperAdmin } from "@/lib/auth/guard";
import { copySignedToDrive, ensureSignedDoc, signedDoc, signedFileName, type SignedKind } from "@/lib/portal/signed-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A student's signed consent or accepted payment terms, as a PDF (super
 * admin). Made on first request for acceptances older than signed PDFs, and
 * then copied to the student's Drive folder. ?version= picks one; ?download=1 saves it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; userId: string }> }) {
  const guard = await apiRequireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { kind, userId } = await params;
  if (kind !== "student_undertaking" && kind !== "payment_terms") return new NextResponse(null, { status: 404 });
  const url = new URL(req.url);
  const id = await ensureSignedDoc(kind as SignedKind, userId, url.searchParams.get("version") ?? undefined);
  const d = id ? await signedDoc(id) : null;
  if (!d) return new NextResponse(null, { status: 404 });
  after(() => copySignedToDrive(d.id));
  return new NextResponse(new Uint8Array(d.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename="${signedFileName(d).replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { verifyState } from "@/lib/auth/oauth";
import {
  exchangeCode,
  accessTokenFrom,
  ensureFolder,
  ROOT_FOLDER_NAME,
} from "@/lib/integrations/drive";
import { saveConnection, saveRootFolder } from "@/lib/db/repos/drive";
import { audit } from "@/lib/db/repos/audit";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Resolved against the request, never a configured base. This threw
  ERR_INVALID_URL with base:'' at the end of a connection that had already been
  saved — the failure looked total and was purely cosmetic, which is the worst
  shape a bug can have.
*/
const back = (origin: string, why: string) =>
  NextResponse.redirect(new URL(`/portal/admin/integrations?drive=${why}`, origin));

/**
 * Google sends the admin back here with a one-time code.
 *
 * The session is re-checked. The state proves the request began here; it does
 * not prove who is finishing it, and an admin-only integration should not be
 * completable by whoever happens to hold the tab.
 */
export async function GET(request: Request) {
  const { session } = await requireAdmin();

  const url = new URL(request.url);
  const origin = url.origin;

  if (url.searchParams.get("error")) return back(origin, "denied");
  if (!verifyState(url.searchParams.get("state")).ok) return back(origin, "expired");

  const code = url.searchParams.get("code");
  if (!code) return back(origin, "failed");

  const tokens = await exchangeCode(code, origin);
  if (!tokens) return back(origin, "failed");

  /*
    Google returns a refresh token only when it feels like it — on a first
    consent, or when consent is forced. Without one we cannot act tomorrow, so
    a connection that has only an access token is not a connection, and saying
    so now beats discovering it at the first export.
  */
  if (!tokens.refreshToken) return back(origin, "norefresh");

  const saved = await saveConnection({
    refreshToken: tokens.refreshToken,
    accountEmail: tokens.email,
    connectedBy: session.userId,
  });
  if (!saved) return back(origin, "failed");

  /*
    The root folder is created NOW rather than at the first export. It proves
    the grant actually works, and it means the admin can open the folder and
    see where files will land before trusting it with a client's passport.
  */
  const token = await accessTokenFrom(tokens.refreshToken);
  if (token) {
    const root = await ensureFolder(token, ROOT_FOLDER_NAME);
    if (root) await saveRootFolder(root.id);
  }

  await audit({
    action: "drive.connected",
    actorId: session.userId,
    actorEmail: session.email,
    entity: "integration",
    meta: { account: tokens.email },
    ip: clientIp(request),
  });

  return back(origin, "connected");
}

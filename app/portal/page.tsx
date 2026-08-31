import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { homeFor } from "@/lib/portal/roles";

/**
 * /portal is a signpost, not a page.
 *
 * The four audiences have genuinely different workspaces, so there is no useful
 * shared dashboard to render here — one that tried would be a compromise none
 * of them wanted. This resolves the role from the SIGNED SESSION on the server
 * and sends the visitor to their own home.
 *
 * Doing it here rather than in the proxy is deliberate: the proxy only sees
 * whether a cookie exists, not what is inside it, and reading a role out of an
 * unverified cookie to decide routing is how people end up trusting one.
 */
export default async function PortalIndex() {
  const { session } = await requireUser();
  redirect(homeFor(session.role));
}

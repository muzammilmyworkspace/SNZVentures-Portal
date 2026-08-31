import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/client";
import { studentStage, pathOpen } from "./stage";

/**
 * THE SERVER-SIDE HALF OF THE GATE.
 *
 * `PortalShell` greys locked items out; this is what actually stops anyone
 * reaching them. The two are not alternatives — a greyed-out link is a hint,
 * and a hint is not a control. Anyone can type a URL, and a student who has
 * not paid typing /portal/application must get the same answer as one who
 * clicked a disabled link.
 *
 * Call it at the top of every gated page, before any data is read. Returning
 * early matters: a page that fetches its data and then redirects has already
 * done the work, and on a one-connection pool that work is a round trip
 * somebody else was queuing for.
 *
 * NON-STUDENTS PASS STRAIGHT THROUGH. The fee stage belongs to the study
 * pathway; gating an advisor or a business account on a fee they were never
 * asked for would lock them out of their own portal.
 */
export async function requireOpen(path: string): Promise<void> {
  const session = await getSession();
  // The layout has already redirected an unauthenticated visitor. Reaching
  // here without a session means something changed mid-request; fail closed.
  if (!session) redirect("/api/auth/expired?next=/portal");
  if (session.role !== "student") return;
  if (!isDatabaseConfigured()) return;

  const { stage } = await studentStage(session.userId);
  if (pathOpen(path, stage)) return;

  /*
    Back to the dashboard, not to a "locked" page.

    The dashboard is where the fee dialog lives and where the reason is already
    explained, so it is the one place that can actually move the student
    forward. `?locked=` lets it say which door they tried rather than showing a
    generic notice that leaves them wondering whether they clicked the wrong
    thing.
  */
  redirect(`/portal/student?locked=${encodeURIComponent(path)}`);
}

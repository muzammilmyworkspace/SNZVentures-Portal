import { requireAdmin } from "@/lib/auth/guard";
import { getAdvisorsWithLoad } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";

export default async function StaffPage() {
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Advisors" />
        <NotConfigured what="Staff management" />
      </>
    );
  }

  /*
    ONE query, not one per advisor.

    This was `advisors.map(a => getAssignedClients(a.id))` — the textbook N+1.
    Twenty advisors meant twenty round trips, and it grew with every hire. A
    LEFT JOIN with a GROUP BY answers the same question once.
  */
  const advisors = await getAdvisorsWithLoad();

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Advisors & assignments"
        lead="Who handles which clients. Advisors can only ever see the clients assigned to them."
      />
      {advisors.length === 0 ? (
        <Panel>
          <EmptyState
            icon="search"
            title="No advisors yet"
            body="Promote a user to the advisor role from Users & roles, then assign clients to them."
            action={{ label: "Go to users", href: "/portal/admin/users" }}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2">
          {advisors.map((a) => (
            <Panel key={a.id} title={a.name}>
              <p className="text-[0.85rem] text-faint">{a.email}</p>
              <dl className="mt-4 border-t border-line pt-3.5 text-[0.9rem]">
                <div className="flex justify-between py-1">
                  <dt className="text-faint">Clients assigned</dt>
                  <dd className="num text-fg">{a.clientCount}</dd>
                </div>
                <div className="flex justify-between py-1">
                  <dt className="text-faint">Open cases</dt>
                  <dd className="num text-fg">{a.openCases}</dd>
                </div>
              </dl>
              {a.clientCount === 0 && (
                <p className="mt-3 text-[0.85rem] text-muted">
                  No clients assigned yet. Assign them from Users.
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

import { requireAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listUnassignedClients } from "@/lib/db/repos/invites";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import {
  PortalHeading,
  Panel,
  EmptyState,
  DataTable,
  Row,
  Cell,
} from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";

export const dynamic = "force-dynamic";

/**
 * CLIENTS WITH NO CONSULTANT — the safety net under enrolment links.
 *
 * Three things put somebody here, and all three are ordinary:
 *
 *  • they registered directly instead of using a link
 *  • their link expired between opening the page and finishing the form
 *  • nobody has sent them a link yet
 *
 * None of those is an error the client can see or fix, and without this screen
 * the only way to notice an unattached student is for a consultant to complain
 * that one of theirs is missing. That is a bad way to find out, because by
 * then the question has already become an argument about whose student it is.
 *
 * Assignment itself is not duplicated here. Users & roles already does it,
 * records who did it, and is where an admin expects to find it — this screen's
 * job is to make sure the question gets asked, not to answer it a second way.
 */
export default async function UnassignedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="People" title="Unassigned clients" />
        <NotConfigured what="Assignment" />
      </>
    );
  }

  const clients = await listUnassignedClients();
  const pg = paginate(clients, pageFrom(sp.page), 20);

  return (
    <>
      <PortalHeading
        eyebrow="People"
        title="Unassigned clients"
        lead="Signed up, but not attached to any consultant. Assign them from Users & roles."
      />

      <Panel>
        {clients.length === 0 ? (
          <EmptyState
            icon="check"
            title="Everyone has a consultant"
            body="Every active client is assigned. New sign-ups that arrive without a link will appear here."
          />
        ) : (
          <DataTable
            columns={["Name", "Email", "Type", "Signed up"]}
            caption="Clients with no consultant assigned"
          >
            {pg.rows.map((c) => (
              <Row key={c.id}>
                <Cell>{c.name}</Cell>
                <Cell muted>{c.email}</Cell>
                <Cell muted>{ROLE_LABEL[c.role as Role]}</Cell>
                <Cell muted>
                  {new Date(c.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Cell>
              </Row>
            ))}
          </DataTable>
        )}
<Pager inset page={pg.page} pages={pg.pages} total={pg.total} size={20} basePath="/portal/admin/unassigned" params={sp} noun="clients" />
      </Panel>

      <p className="mt-5 text-[0.82rem] leading-relaxed text-faint">
        Before assigning a disputed one, check the enrolment record: a student who arrived through
        a link carries the consultant who issued it, with the date it was created and used.
      </p>
    </>
  );
}

import { requireAdmin } from "@/lib/auth/guard";
import { listAudit } from "@/lib/db/repos/audit";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";

export default async function AuditPage() {
  await requireAdmin();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Audit log" />
        <NotConfigured what="Audit logging" />
      </>
    );
  }

  const rows = await listAudit(150);

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Audit log"
        lead="Append-only record of security-relevant actions. Credentials and tokens are never recorded."
      />
      <Panel padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="search"
              title="No entries yet"
              body="Logins, role changes, document reviews and admin actions are recorded here."
            />
          </div>
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Audit log entries</caption>
              <thead>
                <tr className="border-b border-line">
                  {["When", "Actor", "Action", "Entity", "Detail"].map((h) => (
                    <th key={h} scope="col" className="label px-5 py-3 text-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-[0.8rem] text-faint">
                      {new Date(r.createdAt).toLocaleString("en-GB", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-muted">
                      {r.actorEmail ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="label text-accent">{r.action}</span>
                    </td>
                    <td className="px-5 py-3 text-[0.85rem] text-faint">{r.entity ?? "—"}</td>
                    <td className="px-5 py-3 text-[0.8rem] text-faint">
                      {r.meta ? JSON.stringify(r.meta).slice(0, 80) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

import { Panel, EmptyState, PortalHeading } from "@/components/portal/Pieces";
import { getOpportunitiesByKind } from "@/lib/db/repos/portal";

/**
 * Universities, scholarships and jobs — three views of `opportunities`.
 *
 * The table already separates them by `kind`, so one component covers all
 * three. Crucially it reads the REAL table: until staff publish something, each
 * page shows an honest empty state rather than a list of plausible-looking
 * placeholders, which on a page a client will act on would be a lie with
 * consequences.
 */
export async function OpportunityList({
  kind,
  eyebrow,
  title,
  lead,
  emptyTitle,
  emptyBody,
}: {
  kind: "role" | "programme" | "scholarship";
  eyebrow: string;
  title: string;
  lead: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const items = await getOpportunitiesByKind(kind, 60);

  return (
    <>
      <PortalHeading eyebrow={eyebrow} title={title} lead={lead} />

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            icon="search"
            title={emptyTitle}
            body={emptyBody}
            action={{ label: "Talk to your advisor", href: "/portal/messages" }}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((o) => (
            <Panel key={o.id}>
              <p className="text-[1.05rem] font-bold tracking-[-0.02em] text-fg-strong">{o.title}</p>
              <p className="mt-1 text-[0.9rem] text-muted">
                {[o.organisation, o.location || o.country].filter(Boolean).join(" · ")}
              </p>
              {o.summary && (
                <p className="mt-3 border-t border-line pt-3 text-[0.85rem] leading-relaxed text-muted">
                  {o.summary}
                </p>
              )}
              {o.requirements.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {o.requirements.slice(0, 4).map((r) => (
                    <li key={r} className="flex items-start gap-2.5 text-[0.85rem] text-muted">
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-moss-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

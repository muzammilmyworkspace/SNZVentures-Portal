import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  PortalHeading,
  Panel,
  EmptyState,
  StatusPill,
  DataRow,
} from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { getOpportunities } from "@/lib/portal/data";

export default async function Page() {
  const { session } = await requireUser();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Openings" title="Opportunities" />
        <NotConfigured what="Opportunities" />
      </>
    );
  }

  const opportunities = await getOpportunities();

  return (
    <>
      <PortalHeading
        eyebrow="Openings"
        title="Opportunities"
        lead="Roles we are actively mandated on, filtered to what you are genuinely eligible for."
      />
      {opportunities.length === 0 ? (
        <Panel>
          <EmptyState
            icon="search"
            title="No opportunities listed"
            body="We only publish roles we hold a live mandate for. When one matches your profile and eligibility, it appears here — we will not pad this list."
            action={{ label: "Complete your profile", href: "/portal/profile" }}
          />
        </Panel>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-2">
          {opportunities.map((o) => (
            <Panel key={o.id} title={o.country}>
              <h3 className="text-[1.05rem] font-semibold text-fg">{o.title}</h3>
              <p className="mt-1 text-[0.85rem] text-muted">{o.organisation}{o.location ? " · " + o.location : ""}</p>
              {o.summary && <p className="mt-3 text-[0.85rem] leading-relaxed text-muted">{o.summary}</p>}
              {o.requirements.length > 0 && (
                <ul className="mt-4 border-t border-line pt-3">
                  {o.requirements.map((r: string) => (
                    <li key={r} className="border-b border-line py-2 text-[0.85rem] text-muted last:border-0">{r}</li>
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

import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { services } from "@/data/services";
import { getCases } from "@/lib/portal/data";
import { PortalHeading, Panel, StatusPill } from "@/components/portal/Pieces";

/**
 * Services a business client can ask for.
 *
 * The catalogue is SERVICE DEFINITION, not client data — it is the same list
 * the public site publishes, so rendering it here invents nothing. What IS
 * client data is the status beside each one, and that is read from their real
 * cases: a service with an open case shows that case's status, everything else
 * shows as available to request.
 */
export default async function Page() {
  const { session } = await requireRole(["business"], "/portal/services");
  const cases = await getCases(session.userId);

  /*
    Match by title rather than a foreign key, because `cases` has no service_id
    column and adding one to satisfy a listing page would be a migration for a
    presentational nicety. The comparison is loose on purpose — an advisor names
    a case in their own words.
  */
  const statusFor = (name: string) => {
    const hit = cases.find(
      (c) =>
        c.title.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(c.title.toLowerCase())
    );
    return hit?.status ?? null;
  };

  const businessServices = services.filter((s) => s.pathway === "business");

  return (
    <>
      <PortalHeading
        eyebrow="Business"
        title="Services"
        lead="What SnZ can take on for you. Regulated work is delivered through licensed partner firms."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {businessServices.map((s) => {
          const status = statusFor(s.name);
          return (
            <Panel key={s.slug} className="flex flex-col" accent={Boolean(status)}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[1rem] font-bold tracking-[-0.02em] text-fg-strong">{s.name}</p>
                {status ? (
                  <StatusPill status={status} label={status.replace(/_/g, " ")} />
                ) : (
                  <StatusPill status="new" label="Available" />
                )}
              </div>
              <p className="mt-2.5 flex-1 text-[0.85rem] leading-relaxed text-muted">{s.tagline}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={status ? "/portal/cases" : "/portal/messages"}
                  className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
                >
                  {status ? "View progress" : "Request this"}
                </Link>
                <Link
                  href={`/services/${s.slug}`}
                  className="label inline-flex min-h-11 items-center px-2 text-faint transition-colors hover:text-accent"
                >
                  What it involves
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="mt-6 text-[0.8rem] leading-relaxed text-faint">
        Requesting a service starts a conversation, not a contract. We tell you
        early if a route does not fit your case.
      </p>
    </>
  );
}

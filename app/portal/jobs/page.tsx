import { requireRole } from "@/lib/auth/guard";
import { OpportunityList } from "@/components/portal/OpportunityList";

/** Jobs — scoped to professional accounts, enforced server-side. */
export default async function Page() {
  await requireRole(["professional"], "/portal/jobs");
  return (
    <OpportunityList
      kind="role"
      eyebrow="Opportunities"
      title="Jobs"
      lead="Roles we are actually mandated on. We do not list positions we cannot put you forward for."
      emptyTitle="No roles listed yet"
      emptyBody="Openings appear here as your advisor matches them to your experience and work authorisation."
    />
  );
}

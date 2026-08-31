import { requireRole } from "@/lib/auth/guard";
import { OpportunityList } from "@/components/portal/OpportunityList";

/** Scholarships — scoped to student accounts, enforced server-side. */
export default async function Page() {
  await requireRole(["student"], "/portal/scholarships");
  return (
    <OpportunityList
      kind="scholarship"
      eyebrow="Funding"
      title="Scholarships"
      lead="Schemes relevant to your level and destinations. Award terms are set by the provider, not by us."
      emptyTitle="No scholarships listed yet"
      emptyBody="Funding routes appear here once your advisor has matched them to your level, field and destinations."
    />
  );
}

import { requireRole } from "@/lib/auth/guard";
import { requireOpen } from "@/lib/portal/gate";
import { OpportunityList } from "@/components/portal/OpportunityList";

/** Universities — scoped to student accounts, enforced server-side. */
export default async function Page() {
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/universities");
  await requireRole(["student"], "/portal/universities");
  return (
    <OpportunityList
      kind="programme"
      eyebrow="Explore"
      title="Universities"
      lead="Programmes your advisor has published for you to consider."
      emptyTitle="Nothing published yet"
      emptyBody="Your advisor publishes programmes here once they have read your profile and know what actually fits."
    />
  );
}

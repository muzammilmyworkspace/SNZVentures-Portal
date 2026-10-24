import { requireRole } from "@/lib/auth/guard";
import { ClientDashboard } from "@/components/portal/ClientDashboard";
import { FeeGate } from "@/components/portal/FeeGate";
import { studentStage } from "@/lib/portal/stage";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isStorageConfigured } from "@/lib/storage";
import { getProfile } from "@/lib/db/repos/profiles";
import { getPaymentSettings, planFor } from "@/lib/db/repos/payments";
import { scheduleFor } from "@/lib/portal/payment-plan";
import { paymentSettingsFrom } from "@/lib/portal/payment-plan";
import { memberId } from "@/lib/portal/member-id";
import { db, safeQuery } from "@/lib/db/client";

/**
 * Student dashboard.
 *
 * `requireRole` runs on the SERVER and redirects anyone whose session says
 * otherwise, so this URL cannot be used to view another audience's workspace.
 * The role is read from the signed cookie, never from the path.
 *
 * This page is deliberately NOT gated. It is where the fee dialog lives, so
 * locking it would lock the door and leave the key on the inside — and it is
 * where a student redirected away from a locked page lands, which only helps
 * if there is something here that explains why.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string; fee?: string }>;
}) {
  const { session } = await requireRole(["student"], "/portal/student");
  const { locked, fee } = await searchParams;
  // What registration already told us, so the fee form does not ask again.
  const profile = isDatabaseConfigured() ? await getProfile(session.userId, session.role) : {};
  const known = {
    phone: profile.phone ?? "",
    city: [profile.city, profile.country].filter(Boolean).join(", "),
    nationality: profile.nationality ?? "",
  };

  const { stage, rejectionNote } = isDatabaseConfigured()
    ? await studentStage(session.userId)
    : { stage: "fee_due" as const, rejectionNote: null };

  // The process fee: amounts and voucher details, the plan chosen, and the ID quoted as the reference.
  const [payments, plan, memberNo] = isDatabaseConfigured()
    ? await Promise.all([
        getPaymentSettings(),
        planFor(session.userId),
        safeQuery(async () => {
          const [r] = await db()`SELECT member_no FROM users WHERE id = ${session.userId}`;
          return r?.member_no == null ? null : Number(r.member_no);
        }, null as number | null),
      ])
    : [paymentSettingsFrom(null), null, null];

  return (
    <>
      <FeeGate
        stage={stage}
        rejectionNote={rejectionNote}
        studentName={session.name}
        studentEmail={session.email}
        known={known}
        storageOn={isStorageConfigured()}
        lockedPath={locked ?? null}
        justSubmitted={fee === "submitted"}
        payments={payments}
        // A plan saved without its schedule falls back to the current amounts.
        plan={plan && plan.schedule.length === 0 ? { ...plan, schedule: scheduleFor(plan.plan, payments) } : plan}
        studentCode={memberId(session.role, memberNo)}
      />
      <ClientDashboard session={session} />
    </>
  );
}

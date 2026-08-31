/**
 * THE STUDENT STAGE, AND WHAT IT UNLOCKS
 * ---------------------------------------------------------------------------
 * A student moves through a fixed sequence, and most of the portal stays shut
 * until they have paid and we have checked the receipt:
 *
 *   fee_due        nothing submitted yet          → the fee dialog opens
 *   fee_review     submitted, we have not checked → still locked, now waiting
 *   fee_rejected   we checked and it was wrong    → locked, with the reason
 *   application    fee verified                   → the application form opens
 *   consent_due    application submitted          → Form B is the last step
 *   complete       Form B signed                   → everything open
 *
 * DERIVED, NEVER STORED. There is no `stage` column. The stage is computed
 * from the rows that actually exist, so it cannot disagree with them — a
 * stored stage is a second source of truth, and the first time a write
 * half-fails it starts locking out students who have paid, or letting through
 * ones who have not. See the note in migration 007.
 *
 * THIS MODULE DECIDES ACCESS. `PortalShell` uses it to grey out nav items, but
 * greying out a link is decoration: the page itself must refuse. Every gated
 * page calls `requireStage` server-side, so typing the URL gets the same answer
 * as clicking the link.
 */

import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";

export type StudentStage =
  | "fee_due"
  | "fee_review"
  | "fee_rejected"
  | "application"
  | "consent_due"
  | "complete";

export type StageInfo = {
  stage: StudentStage;
  /** Why the last fee submission was refused, when there is one. */
  rejectionNote: string | null;
};

/**
 * Everything the gate needs, in ONE round trip.
 *
 * This is read on every portal page load for a student, by the layout and
 * sometimes by the page under it. On a `max: 1` pool against Supabase's
 * transaction pooler, three separate reads here would be three sequential
 * round trips on every navigation — the exact shape that has caused a 504 in
 * this codebase three times. One statement, three subqueries.
 */
export async function studentStage(userId: string): Promise<StageInfo> {
  const locked: StageInfo = { stage: "fee_due", rejectionNote: null };
  if (!isDatabaseConfigured()) return locked;

  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        (SELECT status::text FROM fee_submissions
          WHERE user_id = ${userId} AND status IN ('submitted','verified')
          LIMIT 1) AS fee_live,
        (SELECT review_note FROM fee_submissions
          WHERE user_id = ${userId} AND status = 'rejected'
          ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
          LIMIT 1) AS fee_note,
        (SELECT count(*)::int FROM fee_submissions
          WHERE user_id = ${userId}) AS fee_any,
        (SELECT status::text FROM intake_forms
          WHERE user_id = ${userId} AND pathway = 'student'
          LIMIT 1) AS intake_status,
        (SELECT count(*)::int FROM consents
          WHERE user_id = ${userId} AND kind = 'student_undertaking') AS consented
    `;

    const feeLive = r?.fee_live as string | null;
    const feeAny = Number(r?.fee_any ?? 0);
    const intake = r?.intake_status as string | null;
    const consented = Number(r?.consented ?? 0) > 0;
    const note = r?.fee_note ? String(r.fee_note) : null;

    // Not paid, or the last attempt was refused.
    if (feeLive === null) {
      return feeAny > 0
        ? { stage: "fee_rejected" as const, rejectionNote: note }
        : locked;
    }
    if (feeLive === "submitted") return { stage: "fee_review", rejectionNote: null };

    // Fee verified from here on.
    const submitted = intake !== null && intake !== "draft";
    if (!submitted) return { stage: "application", rejectionNote: null };
    if (!consented) return { stage: "consent_due", rejectionNote: null };
    return { stage: "complete", rejectionNote: null };
  }, locked);
}

/* ------------------------------------------------------------- what opens */

const ORDER: StudentStage[] = [
  "fee_due",
  "fee_rejected",
  "fee_review",
  "application",
  "consent_due",
  "complete",
];

/**
 * Routes that stay open at EVERY stage.
 *
 * A locked student who cannot reach us is a student who emails a competitor
 * instead, so Messages and Notifications are never gated. Settings stays open
 * because a password change must not depend on having paid, and the dashboard
 * is where the fee dialog lives — locking it would lock the door and leave the
 * key inside.
 */
const ALWAYS_OPEN = [
  "/portal",
  "/portal/student",
  "/portal/messages",
  "/portal/notifications",
  "/portal/settings",
  "/portal/support",
];

/** Opens once the fee is verified. */
const NEEDS_FEE = [
  "/portal/application",
  "/portal/journey",
  "/portal/cases",
  "/portal/documents",
  "/portal/tasks",
  "/portal/universities",
  "/portal/scholarships",
  "/portal/appointments",
  "/portal/profile",
];

export function stageAtLeast(stage: StudentStage, min: StudentStage): boolean {
  return ORDER.indexOf(stage) >= ORDER.indexOf(min);
}

/** True when the fee has been checked and passed. */
export const feeCleared = (stage: StudentStage) => stageAtLeast(stage, "application");

/**
 * Is this path open at this stage?
 *
 * Unknown paths default to OPEN. That is deliberate: a page added later should
 * not silently become unreachable for every student because someone forgot to
 * list it. Gating is opt-in and visible in NEEDS_FEE above, where it can be
 * read, rather than implied by absence.
 */
export function pathOpen(path: string, stage: StudentStage): boolean {
  const match = (list: string[]) =>
    list.some((p) => path === p || path.startsWith(`${p}/`));
  if (match(ALWAYS_OPEN)) return true;
  if (match(NEEDS_FEE)) return feeCleared(stage);
  return true;
}

/** One line for the visitor, explaining why a locked thing is locked. */
export function lockReason(stage: StudentStage): string | null {
  switch (stage) {
    case "fee_due":
      return "Complete your fee verification to open the rest of your portal.";
    case "fee_review":
      return "We're checking your receipt. This usually takes one working day.";
    case "fee_rejected":
      return "There's a problem with your fee verification — please resubmit it.";
    default:
      return null;
  }
}

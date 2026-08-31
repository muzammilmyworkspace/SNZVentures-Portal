/**
 * WHAT EACH STAGE OPENS — pure rules, no database.
 *
 * Split out of stage.ts so these can be asserted directly by
 * `npm run verify:gate`, with no server, no connection and no fixtures. They
 * are the security-relevant half of the gate and they were wrong once: the
 * always-open list contained "/portal" and the matcher treated it as a PREFIX,
 * so every route under /portal was open at every stage and nothing was ever
 * locked. The list read correctly. Only running it found that.
 *
 * Keep this file free of imports. The moment it needs one it stops being
 * runnable on its own, and the test goes with it.
 */

export type StudentStage =
  | "fee_due"
  | "fee_review"
  | "fee_rejected"
  | "application"
  | "consent_due"
  | "complete";

const ORDER: StudentStage[] = [
  "fee_due",
  "fee_rejected",
  "fee_review",
  "application",
  "consent_due",
  "complete",
];

/**
 * EXACT matches. "/portal" must never be treated as a prefix — see the header.
 *
 * The dashboard is where the fee dialog lives, so locking it would lock the
 * door and leave the key inside; it is also where a student redirected from a
 * locked page lands, which only helps if there is something there to explain
 * why.
 */
const ALWAYS_OPEN_EXACT = ["/portal", "/portal/student"];

/**
 * Open along with everything beneath them.
 *
 * A locked student who cannot reach us is a student who emails a competitor
 * instead, so Messages and Notifications are never gated — including a single
 * thread at /portal/messages/<id>. Settings stays open because changing a
 * password must not depend on having paid.
 */
const ALWAYS_OPEN_PREFIX = [
  "/portal/messages",
  "/portal/notifications",
  "/portal/settings",
  "/portal/support",
];

/** Locked until staff verify the fee. Children are locked with the parent. */
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
 * Unknown paths default to OPEN, deliberately: a page added later should not
 * silently become unreachable for every student because someone forgot to list
 * it. Gating is opt-in and visible in NEEDS_FEE, where it can be read, rather
 * than implied by absence.
 */
export function pathOpen(path: string, stage: StudentStage): boolean {
  const underAny = (list: string[]) =>
    list.some((p) => path === p || path.startsWith(`${p}/`));

  if (ALWAYS_OPEN_EXACT.includes(path)) return true;
  if (underAny(ALWAYS_OPEN_PREFIX)) return true;
  if (underAny(NEEDS_FEE)) return feeCleared(stage);
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

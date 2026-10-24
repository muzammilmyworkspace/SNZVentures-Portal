import { db, safeQuery, isDatabaseConfigured } from "../client";
import { deleteObject } from "@/lib/storage";

/*
 * RESET: remove every student and consultant from the portal.
 *
 * Asked for by the owner to start clean. Deletes the accounts with a client
 * role (student, job seeker, business) or a consultant role (consultant,
 * consultant applicant). Everything they own goes with them through the
 * foreign keys (ON DELETE CASCADE: profiles, cases, applications, documents,
 * fee submissions, consents, messages, notifications, invites, payment plans).
 *
 * KEPT: the Super Admin, employees and sales agents; settings, forms and
 * templates; finance entries and invoices (their links to the deleted people
 * become empty, so the books still add up).
 *
 * Uploaded files are removed from storage too, best effort, after the
 * database delete has committed.
 */

export const RESET_ROLES = ["student", "professional", "business", "advisor", "applicant"] as const;

export type ResetCounts = { students: number; consultants: number; documents: number; fees: number; applications: number };

export async function resetCounts(): Promise<ResetCounts> {
  const zero = { students: 0, consultants: 0, documents: 0, fees: 0, applications: 0 };
  if (!isDatabaseConfigured()) return zero;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        (SELECT count(*)::int FROM users WHERE role::text IN ('student','professional','business')) AS students,
        (SELECT count(*)::int FROM users WHERE role::text IN ('advisor','applicant')) AS consultants,
        (SELECT count(*)::int FROM documents d JOIN users u ON u.id = d.owner_id
          WHERE u.role::text = ANY(${RESET_ROLES as unknown as string[]})) AS documents,
        (SELECT count(*)::int FROM fee_submissions f JOIN users u ON u.id = f.user_id
          WHERE u.role::text = ANY(${RESET_ROLES as unknown as string[]})) AS fees,
        (SELECT count(*)::int FROM intake_forms i JOIN users u ON u.id = i.user_id
          WHERE u.role::text = ANY(${RESET_ROLES as unknown as string[]})) AS applications
    `;
    return {
      students: Number(r?.students ?? 0),
      consultants: Number(r?.consultants ?? 0),
      documents: Number(r?.documents ?? 0),
      fees: Number(r?.fees ?? 0),
      applications: Number(r?.applications ?? 0),
    };
  }, zero);
}

/** Deletes them all in one transaction; returns how many accounts went and how many files. */
export async function resetClientsAndConsultants(): Promise<{ accounts: number; files: number }> {
  const { accounts, keys } = await db().begin(async (tx) => {
    const files = await tx`
      SELECT d.storage_key, d.storage_provider FROM documents d JOIN users u ON u.id = d.owner_id
       WHERE u.role::text = ANY(${RESET_ROLES as unknown as string[]}) AND d.storage_key IS NOT NULL
    `;
    // Their used invite links first: claimed_by would be emptied while claimed_at
    // stays, which the student_invites_claim_is_whole check refuses.
    await tx`
      DELETE FROM student_invites
       WHERE claimed_by IN (SELECT id FROM users WHERE role::text = ANY(${RESET_ROLES as unknown as string[]}))
    `;
    const gone = await tx`
      DELETE FROM users WHERE role::text = ANY(${RESET_ROLES as unknown as string[]}) RETURNING id
    `;
    return {
      accounts: gone.length,
      keys: files.map((f) => ({ key: String(f.storage_key), provider: f.storage_provider ? String(f.storage_provider) : null })),
    };
  });

  let removed = 0;
  for (const f of keys) {
    try {
      await deleteObject(f.key, f.provider as Parameters<typeof deleteObject>[1]);
      removed += 1;
    } catch (error) {
      console.error("[reset] could not delete a stored file:", error);
    }
  }
  return { accounts, files: removed };
}

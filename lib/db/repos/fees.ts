import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * FEE SUBMISSIONS
 * ---------------------------------------------------------------------------
 * The student's own declaration of a payment (Form A), the receipt they
 * uploaded, and the staff decision on it. See migration 007.
 *
 * The write path deliberately does NOT use `safeQuery`. A submission that
 * silently returns null would leave the student looking at a success screen
 * for a payment nobody recorded — the same failure the public enquiry form was
 * fixed for. Failures here must surface.
 */

export type FeeStatus = "submitted" | "verified" | "rejected" | "withdrawn";

export type FeeSubmission = {
  id: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  university: string;
  programme: string | null;
  feeType: string;
  currency: string;
  amount: string;
  method: string;
  txnRef: string | null;
  payDate: string | null;
  thirdParty: boolean;
  payerName: string | null;
  payerRelation: string | null;
  receiptDocumentId: string | null;
  signedName: string;
  signedAt: string;
  declarantPassport: string | null;
  declarantNationality: string | null;
  declarantCity: string | null;
  declarantPhone: string | null;
  status: FeeStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

const map = (r: Record<string, unknown>): FeeSubmission => ({
  id: String(r.id),
  userId: String(r.user_id),
  studentName: r.student_name ? String(r.student_name) : "",
  studentEmail: r.student_email ? String(r.student_email) : "",
  university: String(r.university),
  programme: r.programme ? String(r.programme) : null,
  feeType: String(r.fee_type),
  currency: String(r.currency),
  amount: String(r.amount),
  method: String(r.method),
  txnRef: r.txn_ref ? String(r.txn_ref) : null,
  payDate: r.pay_date ? new Date(r.pay_date as string).toISOString().slice(0, 10) : null,
  thirdParty: Boolean(r.third_party),
  payerName: r.payer_name ? String(r.payer_name) : null,
  payerRelation: r.payer_relation ? String(r.payer_relation) : null,
  receiptDocumentId: r.receipt_document_id ? String(r.receipt_document_id) : null,
  signedName: String(r.signed_name),
  signedAt: new Date(r.signed_at as string).toISOString(),
  declarantPassport: r.declarant_passport ? String(r.declarant_passport) : null,
  declarantNationality: r.declarant_nationality ? String(r.declarant_nationality) : null,
  declarantCity: r.declarant_city ? String(r.declarant_city) : null,
  declarantPhone: r.declarant_phone ? String(r.declarant_phone) : null,
  status: r.status as FeeStatus,
  reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
  reviewNote: r.review_note ? String(r.review_note) : null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

export async function createFeeSubmission(input: {
  userId: string;
  // Identity AS DECLARED. A copy, not a join to profiles — a signed document
  // has to keep saying what it said on the day. See migration 008.
  declarantName: string;
  declarantFather?: string | null;
  declarantPassport: string;
  declarantNationality: string;
  declarantDob?: string | null;
  declarantEmail: string;
  declarantPhone: string;
  declarantCity: string;
  declarantAddress?: string | null;
  university: string;
  programme?: string | null;
  feeType: string;
  currency: string;
  amount: string;
  method: string;
  txnRef?: string | null;
  payDate?: string | null;
  thirdParty: boolean;
  payerName?: string | null;
  payerRelation?: string | null;
  receiptDocumentId?: string | null;
  signaturePng?: string | null;
  signedName: string;
  consentVersion: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const rows = await db()`
    INSERT INTO fee_submissions (
      user_id, university, programme, fee_type, currency, amount, method,
      txn_ref, pay_date, third_party, payer_name, payer_relation,
      receipt_document_id, signature_png, signed_name, consent_version,
      ip, user_agent,
      declarant_name, declarant_father, declarant_passport, declarant_nationality,
      declarant_dob, declarant_email, declarant_phone, declarant_city,
      declarant_address
    ) VALUES (
      ${input.userId}, ${input.university}, ${input.programme ?? null},
      ${input.feeType}, ${input.currency}, ${input.amount}, ${input.method},
      ${input.txnRef ?? null}, ${input.payDate ?? null}, ${input.thirdParty},
      ${input.payerName ?? null}, ${input.payerRelation ?? null},
      ${input.receiptDocumentId ?? null}, ${input.signaturePng ?? null},
      ${input.signedName}, ${input.consentVersion},
      ${input.ip ?? null}, ${input.userAgent ?? null},
      ${input.declarantName}, ${input.declarantFather ?? null},
      ${input.declarantPassport}, ${input.declarantNationality},
      ${input.declarantDob ?? null}, ${input.declarantEmail},
      ${input.declarantPhone}, ${input.declarantCity},
      ${input.declarantAddress ?? null}
    )
    RETURNING id
  `;
  return String(rows[0].id);
}

/**
 * A student takes back a receipt we have not looked at yet.
 *
 * SCOPED TO THEIR OWN ROW AND TO 'submitted', in the statement rather than in
 * a check above it. A withdrawal that could reach a verified submission would
 * let somebody re-open a portal we had already decided about, and one that
 * took a user id from anywhere but the session would let them reach another
 * person's declaration. Both are closed by the WHERE clause, which cannot be
 * skipped by a caller that forgets.
 *
 * Returns the id of what was withdrawn, or null when there was nothing to
 * withdraw — which is also the answer when two tabs press it at once.
 */
export async function withdrawFeeSubmission(userId: string): Promise<string | null> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE fee_submissions
         SET status = 'withdrawn'::fee_status, updated_at = now()
       WHERE user_id = ${userId} AND status = 'submitted'
      RETURNING id
    `;
    return rows[0] ? String(rows[0].id) : null;
  }, null);
}

/** The student's current claim, if any. Rejected ones are not "current". */
export async function liveFeeFor(userId: string): Promise<FeeSubmission | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT f.*, u.name AS student_name, u.email AS student_email
      FROM fee_submissions f JOIN users u ON u.id = f.user_id
      WHERE f.user_id = ${userId} AND f.status IN ('submitted','verified')
      LIMIT 1
    `;
    return rows[0] ? map(rows[0]) : null;
  }, null);
}

/**
 * EVERY submission this student has made, newest first — rejected ones too.
 *
 * liveFeeFor() deliberately hides rejected rows, because they are not the
 * student's current claim. That is right for the gate and wrong for staff
 * answering "I approved it, why is their portal still shut": the answer is
 * usually in a row that liveFeeFor cannot see, or in the absence of any row
 * for the account being looked at.
 */
export async function feeHistoryFor(userId: string): Promise<FeeSubmission[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT f.*, u.name AS student_name, u.email AS student_email
      FROM fee_submissions f JOIN users u ON u.id = f.user_id
      WHERE f.user_id = ${userId}
      ORDER BY f.created_at DESC
      LIMIT 20
    `;
    return rows.map(map);
  }, []);
}

/**
 * The staff queue, newest first, with the pending count in the same round trip.
 * `status = null` means every state, which is what the history view wants.
 */
export async function listFeeSubmissions(
  status: FeeStatus | null = "submitted",
  limit = 100
): Promise<{ rows: FeeSubmission[]; pending: number }> {
  const empty = { rows: [] as FeeSubmission[], pending: 0 };
  if (!isDatabaseConfigured()) return empty;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        COALESCE((SELECT json_agg(x) FROM (
          SELECT f.*, u.name AS student_name, u.email AS student_email
          FROM fee_submissions f JOIN users u ON u.id = f.user_id
          WHERE (${status}::text IS NULL OR f.status = ${status}::fee_status)
          ORDER BY f.created_at DESC
          LIMIT ${limit}
        ) x), '[]'::json) AS rows,
        (SELECT count(*)::int FROM fee_submissions WHERE status = 'submitted') AS pending
    `;
    return {
      rows: ((r?.rows ?? []) as Record<string, unknown>[]).map(map),
      pending: Number(r?.pending ?? 0),
    };
  }, empty);
}

export async function getFeeSubmission(id: string): Promise<FeeSubmission | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT f.*, u.name AS student_name, u.email AS student_email
      FROM fee_submissions f JOIN users u ON u.id = f.user_id
      WHERE f.id = ${id} LIMIT 1
    `;
    return rows[0] ? map(rows[0]) : null;
  }, null);
}

/**
 * The staff decision.
 *
 * Returns the row as it now stands so the caller can email the student without
 * a second read — and so a decision made twice in two tabs cannot send two
 * contradictory emails: the `WHERE status = 'submitted'` clause means the
 * second write changes nothing and returns nothing.
 */
export async function reviewFeeSubmission(
  id: string,
  status: Extract<FeeStatus, "verified" | "rejected">,
  reviewerId: string,
  note: string | null
): Promise<FeeSubmission | null> {
  const rows = await db()`
    UPDATE fee_submissions
    SET status = ${status}::fee_status, reviewed_by = ${reviewerId},
        reviewed_at = now(), review_note = ${note}, updated_at = now()
    WHERE id = ${id} AND status = 'submitted'
    RETURNING id
  `;
  if (!rows[0]) return null;
  return getFeeSubmission(id);
}

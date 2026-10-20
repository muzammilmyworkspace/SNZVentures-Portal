import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * THE STUDENT DESK: every student whose fee is verified, with where their
 * application stands and how their documents are going.
 *
 * `consultantName` is the consultant (an advisor account) the student came
 * through, or null when they came to SnZ Ventures directly. The page decides
 * how much of that each viewer sees.
 */

export type DeskStudent = {
  userId: string;
  name: string;
  email: string;
  memberNo: number | null;
  avatarV: number | null;
  phone: string | null;
  nationality: string | null;
  feeVerifiedAt: string | null;
  intakeId: string | null;
  /** null: not started yet. Otherwise the application's status. */
  status: string | null;
  submittedAt: string | null;
  updatedAt: string;
  docs: number;
  docsApproved: number;
  docsWaiting: number;
  /** Their consultant, or null: they came to SnZ Ventures directly. */
  consultantName: string | null;
};

export async function deskStudents(): Promise<DeskStudent[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT u.id, u.name, u.email, u.member_no,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS avatar_v,
             p.phone, p.nationality,
             fee.reviewed_at AS fee_verified_at,
             f.id AS intake_id, f.status::text AS intake_status, f.submitted_at,
             GREATEST(u.updated_at, COALESCE(f.updated_at, u.updated_at)) AS updated_at,
             COALESCE(d.total, 0) AS docs, COALESCE(d.approved, 0) AS docs_approved,
             COALESCE(d.waiting, 0) AS docs_waiting,
             adv.name AS consultant_name
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT fs.reviewed_at FROM fee_submissions fs
           WHERE fs.user_id = u.id AND fs.status = 'verified'
           ORDER BY fs.reviewed_at DESC NULLS LAST LIMIT 1
        ) fee ON TRUE
        LEFT JOIN intake_forms f ON f.user_id = u.id AND f.pathway = 'study'
        -- Consultants only: a student linked to a staff account came to us directly.
        LEFT JOIN LATERAL (
          SELECT a.name FROM staff_assignments sa JOIN users a ON a.id = sa.advisor_id
           WHERE sa.client_id = u.id AND a.role = 'advisor'
           ORDER BY sa.created_at ASC LIMIT 1
        ) adv ON TRUE
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE storage_key IS NOT NULL)::int AS total,
                 count(*) FILTER (WHERE status = 'approved')::int AS approved,
                 count(*) FILTER (WHERE status IN ('uploaded', 'pending_review'))::int AS waiting
            FROM documents WHERE owner_id = u.id
        ) d ON TRUE
       WHERE u.role = 'student'
         AND u.status = 'active'
         -- Past the fee: verified, or (older files) already submitted an application.
         AND (fee.reviewed_at IS NOT NULL OR (f.status IS NOT NULL AND f.status::text <> 'draft'))
       ORDER BY updated_at DESC
       LIMIT 2000
    `;
    return rows.map((r) => ({
      userId: String(r.id),
      name: String(r.name),
      email: String(r.email),
      memberNo: r.member_no == null ? null : Number(r.member_no),
      avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
      phone: r.phone ? String(r.phone) : null,
      nationality: r.nationality ? String(r.nationality) : null,
      feeVerifiedAt: r.fee_verified_at ? new Date(r.fee_verified_at as string).toISOString() : null,
      intakeId: r.intake_id ? String(r.intake_id) : null,
      status: r.intake_status ? String(r.intake_status) : null,
      submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
      updatedAt: new Date(r.updated_at as string).toISOString(),
      docs: Number(r.docs),
      docsApproved: Number(r.docs_approved),
      docsWaiting: Number(r.docs_waiting),
      consultantName: r.consultant_name ? String(r.consultant_name) : null,
    }));
  }, []);
}

/** Is this person a student on the desk (fee verified or application sent)? */
export async function onDesk(userId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT 1 FROM users u
       WHERE u.id = ${userId} AND u.role = 'student'
         AND (EXISTS (SELECT 1 FROM fee_submissions fs WHERE fs.user_id = u.id AND fs.status = 'verified')
              OR EXISTS (SELECT 1 FROM intake_forms f WHERE f.user_id = u.id AND f.status::text <> 'draft'))
    `;
    return Boolean(r);
  }, false);
}

/* ---------------------------------------------------------- first sign-in */

export async function mustOnboard(userId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const [r] = await db()`SELECT must_onboard FROM users WHERE id = ${userId}`;
    return r?.must_onboard === true;
  }, false);
}

export async function setMustOnboard(userId: string, value: boolean): Promise<void> {
  await safeQuery(async () => {
    await db()`UPDATE users SET must_onboard = ${value} WHERE id = ${userId}`;
    return true;
  }, false);
}

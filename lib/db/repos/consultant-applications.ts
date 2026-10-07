import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * CONSULTANT APPLICATIONS (migration 037).
 *
 *   draft -> submitted -> consent_sent -> consent_signed -> approved
 *                      \-> rejected (from any open step)
 *
 * The applicant fills in and submits; the super admin sends the consultant
 * consent; the applicant signs it in the portal; the super admin approves,
 * which makes the account a consultant.
 */

export type AppStatus = "draft" | "submitted" | "consent_sent" | "consent_signed" | "approved" | "rejected";

export type ConsultantApplication = {
  userId: string;
  name: string;
  email: string;
  memberNo: number | null;
  avatarV: number | null;
  status: AppStatus;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  companyName: string | null;
  companyRegistered: boolean | null;
  registrationNo: string | null;
  website: string | null;
  about: string | null;
  rejectReason: string | null;
  submittedAt: string | null;
  consentSentAt: string | null;
  consentSignedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  documents: { id: string; name: string; status: string }[];
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function toApp(r: Record<string, unknown>): ConsultantApplication {
  return {
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    memberNo: r.member_no == null ? null : Number(r.member_no),
    avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
    status: String(r.status) as AppStatus,
    phone: r.phone ? String(r.phone) : null,
    address: r.address ? String(r.address) : null,
    city: r.city ? String(r.city) : null,
    country: r.country ? String(r.country) : null,
    companyName: r.company_name ? String(r.company_name) : null,
    companyRegistered: r.company_registered == null ? null : r.company_registered === true,
    registrationNo: r.registration_no ? String(r.registration_no) : null,
    website: r.website ? String(r.website) : null,
    about: r.about ? String(r.about) : null,
    rejectReason: r.reject_reason ? String(r.reject_reason) : null,
    submittedAt: iso(r.submitted_at),
    consentSentAt: iso(r.consent_sent_at),
    consentSignedAt: iso(r.consent_signed_at),
    decidedAt: iso(r.decided_at),
    createdAt: iso(r.created_at)!,
    documents: ((r.documents ?? []) as Record<string, unknown>[]).map((d) => ({
      id: String(d.id),
      name: String(d.name),
      status: String(d.status),
    })),
  };
}

const SELECT = (sql: ReturnType<typeof db>) => sql`
  SELECT a.*, u.name, u.email, u.member_no,
         CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS avatar_v,
         COALESCE((SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'status', d.status) ORDER BY d.created_at)
                     FROM documents d WHERE d.owner_id = a.user_id AND d.category = 'Company document'), '[]'::json) AS documents
    FROM consultant_applications a JOIN users u ON u.id = a.user_id
`;

/** This person's application, made (empty) the first time they open it. */
export async function applicationFor(userId: string): Promise<ConsultantApplication | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const sql = db();
    await sql`
      INSERT INTO consultant_applications (user_id, phone, city, country)
      SELECT u.id, p.phone, p.city, p.country FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ${userId}
      ON CONFLICT (user_id) DO NOTHING`;
    const [r] = await sql`${SELECT(sql)} WHERE a.user_id = ${userId}`;
    return r ? toApp(r) : null;
  }, null);
}

export async function listApplications(): Promise<ConsultantApplication[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const sql = db();
    const rows = await sql`${SELECT(sql)} WHERE a.status <> 'draft' ORDER BY a.submitted_at DESC NULLS LAST LIMIT 500`;
    return rows.map(toApp);
  }, []);
}

/** How many wait on the super admin: new, and signed but not yet approved. */
export async function waitingCount(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  return safeQuery(async () => {
    const [r] = await db()`SELECT count(*)::int AS n FROM consultant_applications WHERE status IN ('submitted', 'consent_signed')`;
    return Number(r?.n ?? 0);
  }, 0);
}

export type AppDetails = {
  phone: string;
  address: string;
  city: string;
  country: string;
  companyName: string;
  companyRegistered: boolean;
  registrationNo: string | null;
  website: string | null;
  about: string | null;
};

/** Save the applicant's details; `submit` sends it to the super admin. Only while it is theirs to edit. */
export async function saveApplication(userId: string, d: AppDetails, submit: boolean): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE consultant_applications SET
        phone = ${d.phone}, address = ${d.address}, city = ${d.city}, country = ${d.country},
        company_name = ${d.companyName}, company_registered = ${d.companyRegistered},
        registration_no = ${d.registrationNo}, website = ${d.website}, about = ${d.about},
        status = CASE WHEN ${submit} THEN 'submitted' ELSE 'draft' END,
        submitted_at = CASE WHEN ${submit} THEN now() ELSE submitted_at END,
        reject_reason = CASE WHEN ${submit} THEN NULL ELSE reject_reason END,
        updated_at = now()
       WHERE user_id = ${userId} AND status IN ('draft', 'rejected')
       RETURNING user_id`;
    return rows.length > 0;
  }, false);
}

/** Move an application on. Only from the step it is expected to be in. */
export async function moveApplication(
  userId: string,
  to: AppStatus,
  from: AppStatus[],
  extra: { decidedBy?: string; reason?: string | null } = {}
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE consultant_applications SET
        status = ${to},
        consent_sent_at = CASE WHEN ${to} = 'consent_sent' THEN now() ELSE consent_sent_at END,
        consent_signed_at = CASE WHEN ${to} = 'consent_signed' THEN now() ELSE consent_signed_at END,
        decided_at = CASE WHEN ${to} IN ('approved', 'rejected') THEN now() ELSE decided_at END,
        decided_by = COALESCE(${extra.decidedBy ?? null}::uuid, decided_by),
        reject_reason = CASE WHEN ${to} = 'rejected' THEN ${extra.reason ?? null} ELSE reject_reason END,
        updated_at = now()
       WHERE user_id = ${userId} AND status = ANY(${from})
       RETURNING user_id`;
    return rows.length > 0;
  }, false);
}

/**
 * Approval: the account becomes a consultant (the consultant code is given
 * by the trigger from migration 024 when the role changes) and the
 * application is marked approved, together or not at all.
 */
export async function approveApplication(userId: string, by: string, from: AppStatus[]): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    return db().begin(async (sql) => {
      const moved = await sql`
        UPDATE consultant_applications SET status = 'approved', decided_at = now(), decided_by = ${by}, updated_at = now()
         WHERE user_id = ${userId} AND status = ANY(${from}) RETURNING user_id`;
      if (!moved.length) return false;
      await sql`UPDATE users SET role = 'advisor', status = 'active', updated_at = now() WHERE id = ${userId} AND role = 'applicant'`;
      return true;
    });
  }, false);
}

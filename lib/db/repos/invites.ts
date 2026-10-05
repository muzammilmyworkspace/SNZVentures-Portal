import { createHash, randomBytes } from "node:crypto";
import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * STUDENT ENROLMENT INVITES
 * ---------------------------------------------------------------------------
 * A consultant creates a link, sends it to one student, and the student who
 * opens it is enrolled under that consultant. See migration 019 for why the
 * link — rather than anybody's word — is what settles "whose student is this".
 *
 * WHAT THIS MODULE REFUSES TO DO
 *
 *  • It will not reveal a token after creation. The raw value is returned once,
 *    from `createInvite`, and only its SHA-256 is stored. An operator who can
 *    read every row still cannot claim a student.
 *
 *  • It will not let one invite bind two students, or one student arrive
 *    through two invites. Both are unique indexes in SQL, not checks in code —
 *    two simultaneous claims must not both succeed, and only the database can
 *    promise that.
 *
 *  • It will not enrol a student who already has a consultant. Re-enrolling
 *    somebody else's student by sending them a fresh link is precisely the
 *    attack this whole design exists to prevent.
 *
 *  • It will not enrol ON BEHALF of an account that is no longer entitled to
 *    receive students. The consultant's role and status are re-read at claim
 *    time, because an invite issued last week outlives the suspension that
 *    happened yesterday.
 */

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Client roles an invite may enrol. Staff are never enrolled this way. */
const ENROLLABLE = ["student", "professional", "business"] as const;

/** Roles that may hold students. `advisor` is the consultant. */
const CAN_HOLD_CLIENTS = ["advisor", "admin", "super_admin"] as const;

export type InviteRow = {
  id: string;
  consultantId: string;
  consultantName: string | null;
  email: string | null;
  note: string | null;
  expiresAt: string;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Derived, so a list does not have to recompute it per row in the view. */
  status: "pending" | "claimed" | "revoked" | "expired";
};

function statusOf(r: Record<string, unknown>): InviteRow["status"] {
  if (r.claimed_at) return "claimed";
  if (r.revoked_at) return "revoked";
  if (new Date(String(r.expires_at)).getTime() < Date.now()) return "expired";
  return "pending";
}

function mapInvite(r: Record<string, unknown>): InviteRow {
  return {
    id: String(r.id),
    consultantId: String(r.consultant_id),
    consultantName: r.consultant_name ? String(r.consultant_name) : null,
    email: r.email ? String(r.email) : null,
    note: r.note ? String(r.note) : null,
    expiresAt: new Date(String(r.expires_at)).toISOString(),
    claimedBy: r.claimed_by ? String(r.claimed_by) : null,
    claimedByName: r.claimed_by_name ? String(r.claimed_by_name) : null,
    claimedAt: r.claimed_at ? new Date(String(r.claimed_at)).toISOString() : null,
    revokedAt: r.revoked_at ? new Date(String(r.revoked_at)).toISOString() : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    status: statusOf(r),
  };
}

/**
 * Mint a link. The raw token is returned ONCE and never stored.
 *
 * Outstanding invites are deliberately NOT invalidated the way `issueToken`
 * invalidates previous password resets: a consultant enrolling six students
 * this morning needs six live links at the same time. That is the whole point
 * of one link per student.
 */
export async function createInvite(input: {
  consultantId: string;
  createdBy: string;
  email?: string | null;
  note?: string | null;
  /** The student's name, for the email greeting and the sign-up form. */
  name?: string | null;
  ttlDays?: number;
}): Promise<{ id: string; token: string; expiresAt: string } | null> {
  if (!isDatabaseConfigured()) return null;

  const raw = randomBytes(32).toString("base64url");
  const days = Math.min(Math.max(input.ttlDays ?? 14, 1), 60);
  const expires = new Date(Date.now() + days * 86_400_000);

  return safeQuery(async () => {
    const rows = await db()`
      INSERT INTO student_invites
        (consultant_id, created_by, token_hash, email, note, name, expires_at)
      VALUES (
        ${input.consultantId}, ${input.createdBy}, ${hashToken(raw)},
        ${input.email?.trim().toLowerCase() || null}, ${input.note?.trim() || null},
        ${input.name?.trim().slice(0, 120) || null},
        ${expires}
      )
      RETURNING id, expires_at
    `;
    if (!rows[0]) return null;
    return {
      id: String(rows[0].id),
      token: raw,
      expiresAt: new Date(String(rows[0].expires_at)).toISOString(),
    };
  }, null);
}

export type InvitePreview = {
  consultantName: string;
  /** The address the invitation was sent to; the account is created with it. */
  email: string | null;
  expiresAt: string;
  name?: string | null;
};

/**
 * What the join page shows BEFORE anything is spent.
 *
 * Returns the consultant's name so the student can see who they are being
 * enrolled under and stop if it is not who they expected — an enrolment nobody
 * checked is how the wrong consultant ends up owning a file.
 *
 * Returns null for every failure without saying which: expired, revoked,
 * already used and never existed are one answer to the browser. Telling them
 * apart would turn this into an oracle for guessing tokens.
 */
export async function previewInvite(rawToken: string): Promise<InvitePreview | null> {
  if (!isDatabaseConfigured() || !rawToken) return null;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT i.expires_at, i.email, i.name, u.name AS consultant_name
        FROM student_invites i
        JOIN users u ON u.id = i.consultant_id
       WHERE i.token_hash = ${hashToken(rawToken)}
         AND i.claimed_at IS NULL
         AND i.revoked_at IS NULL
         AND i.expires_at > now()
         AND u.status = 'active'
         AND u.role::text = ANY(${CAN_HOLD_CLIENTS as unknown as string[]})
       LIMIT 1
    `;
    if (!rows[0]) return null;
    return {
      consultantName: String(rows[0].consultant_name),
      email: rows[0].email ? String(rows[0].email) : null,
      name: rows[0].name ? String(rows[0].name) : null,
      expiresAt: new Date(String(rows[0].expires_at)).toISOString(),
    };
  }, null);
}

export type ClaimResult =
  | { ok: true; consultantId: string; consultantName: string }
  | { ok: false; reason: "invalid" | "already_assigned" | "not_a_client" };

/**
 * Spend the invite and create the assignment, in ONE transaction.
 *
 * Every condition is re-checked inside it against live rows, including the
 * ones `previewInvite` already checked. The gap between opening the page and
 * submitting the form is long enough for the invite to be revoked, the
 * consultant to be suspended, or another link to be claimed by the same
 * account — and a check made before that gap is not a check.
 *
 * The `FOR UPDATE` is what makes two simultaneous claims serialise rather than
 * race. Without it both transactions read an unclaimed row, both proceed, and
 * only the unique index stops the second — which works, but surfaces as a
 * constraint violation instead of a clean answer.
 */
export async function claimInvite(
  rawToken: string,
  studentId: string
): Promise<ClaimResult> {
  if (!isDatabaseConfigured() || !rawToken) return { ok: false, reason: "invalid" };

  try {
    return await db().begin(async (tx) => {
      const invite = await tx`
        SELECT i.id, i.consultant_id
          FROM student_invites i
         WHERE i.token_hash = ${hashToken(rawToken)}
           AND i.claimed_at IS NULL
           AND i.revoked_at IS NULL
           AND i.expires_at > now()
         FOR UPDATE
      `;
      if (!invite[0]) return { ok: false, reason: "invalid" } as ClaimResult;

      const consultantId = String(invite[0].consultant_id);

      // Re-read the consultant. An invite outlives a suspension.
      const consultant = await tx`
        SELECT id, name FROM users
         WHERE id = ${consultantId}
           AND status = 'active'
           AND role::text = ANY(${CAN_HOLD_CLIENTS as unknown as string[]})
         LIMIT 1
      `;
      if (!consultant[0]) return { ok: false, reason: "invalid" } as ClaimResult;

      // The account being enrolled must be a client, never staff.
      const student = await tx`
        SELECT id FROM users
         WHERE id = ${studentId}
           AND role::text = ANY(${ENROLLABLE as unknown as string[]})
         LIMIT 1
      `;
      if (!student[0]) return { ok: false, reason: "not_a_client" } as ClaimResult;

      /*
        Already spoken for. Checked here rather than left to the unique index
        because staff_assignments allows a client to have SEVERAL advisors by
        design — that is a real thing for a shared case — so the index cannot
        express "one consultant per student" on its own. For enrolment it is a
        refusal: a student who already has a consultant is not up for grabs.
      */
      const existing = await tx`
        SELECT 1 FROM staff_assignments WHERE client_id = ${studentId} LIMIT 1
      `;
      if (existing[0]) return { ok: false, reason: "already_assigned" } as ClaimResult;

      await tx`
        UPDATE student_invites
           SET claimed_by = ${studentId}, claimed_at = now()
         WHERE id = ${invite[0].id}
      `;
      await tx`
        INSERT INTO staff_assignments (client_id, advisor_id, assigned_by)
        VALUES (${studentId}, ${consultantId}, ${consultantId})
      `;

      return {
        ok: true,
        consultantId,
        consultantName: String(consultant[0].name),
      } as ClaimResult;
    });
  } catch {
    /*
      A unique-index violation lands here: the same account claimed a second
      invite, or the same invite was claimed twice, and the database refused
      the loser. "invalid" is the honest answer to give that caller — the
      operation did not happen and nothing was written.
    */
    return { ok: false, reason: "invalid" };
  }
}

/** A consultant's own links. Admins pass any consultantId; consultants their own. */
export async function listInvites(consultantId: string, limit = 100): Promise<InviteRow[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT i.*, c.name AS consultant_name, s.name AS claimed_by_name
        FROM student_invites i
        JOIN users c ON c.id = i.consultant_id
        LEFT JOIN users s ON s.id = i.claimed_by
       WHERE i.consultant_id = ${consultantId}
       ORDER BY i.created_at DESC
       LIMIT ${limit}
    `;
    return rows.map(mapInvite);
  }, []);
}

/**
 * Withdraw an unclaimed link.
 *
 * Scoped by consultant in the WHERE clause rather than checked beforehand, so
 * one consultant cannot revoke another's link by guessing an id. An already
 * claimed invite is NOT revocable: the enrolment it records has happened, and
 * hiding the evidence is the opposite of what this table is for.
 */
export async function revokeInvite(id: string, consultantId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE student_invites
         SET revoked_at = now()
       WHERE id = ${id}
         AND consultant_id = ${consultantId}
         AND claimed_at IS NULL
         AND revoked_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

export type UnassignedClient = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  avatarV: number | null;
};

/**
 * Clients with no consultant at all — the safety net.
 *
 * Somebody who registered directly, or whose link was never used, is not lost;
 * they surface here for an admin to place by hand. Without this screen the
 * only way to notice an unattached student is for someone to complain.
 */
export async function listUnassignedClients(limit = 200): Promise<UnassignedClient[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS avatar_v
        FROM users u
       WHERE u.role::text = ANY(${ENROLLABLE as unknown as string[]})
         AND u.status <> 'suspended'
         AND NOT EXISTS (
           SELECT 1 FROM staff_assignments sa WHERE sa.client_id = u.id
         )
       ORDER BY u.created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      role: String(r.role),
      createdAt: new Date(String(r.created_at)).toISOString(),
      avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
    }));
  }, []);
}

/**
 * How a student got here, for the dispute screen.
 *
 * Returns the invite that enrolled them, if any. A student with no row arrived
 * some other way — self-registration, or an assignment made by hand — and the
 * absence is itself the answer.
 */
export async function inviteForClient(clientId: string): Promise<InviteRow | null> {
  if (!isDatabaseConfigured()) return null;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT i.*, c.name AS consultant_name, s.name AS claimed_by_name
        FROM student_invites i
        JOIN users c ON c.id = i.consultant_id
        LEFT JOIN users s ON s.id = i.claimed_by
       WHERE i.claimed_by = ${clientId}
       LIMIT 1
    `;
    return rows[0] ? mapInvite(rows[0]) : null;
  }, null);
}

/* ------------------------------------------------------- consultant codes */

export type EnrolByCode =
  | { ok: true; consultantId: string; consultantName: string }
  | { ok: false; reason: "invalid" | "already" };

/** The active staff member a code belongs to (case-insensitive), or null. */
export async function consultantForCode(
  code: string
): Promise<{ id: string; name: string } | null> {
  const c = code.trim().toUpperCase();
  if (!/^SNZ-[A-Z]{3}\d{3}$/.test(c)) return null;
  return safeQuery(async () => {
    const [row] = await db()`
      SELECT id, name FROM users
      WHERE upper(consultant_code) = ${c}
        AND role IN ('advisor', 'admin', 'super_admin') AND status = 'active'
      LIMIT 1
    `;
    return row ? { id: String(row.id), name: String(row.name) } : null;
  }, null);
}

/**
 * Enrol a client with the consultant whose code they typed.
 *
 * Only for somebody who has NO consultant yet: a code must not be a way for a
 * student to move themselves off one consultant and onto another, which is a
 * decision for an admin.
 */
export async function enrolByCode(
  clientId: string,
  code: string
): Promise<EnrolByCode> {
  const consultant = await consultantForCode(code);
  if (!consultant) return { ok: false, reason: "invalid" };
  return safeQuery<EnrolByCode>(
    async () => {
      const rows = await db()`
        INSERT INTO staff_assignments (client_id, advisor_id, assigned_by)
        SELECT ${clientId}, ${consultant.id}, ${consultant.id}
        WHERE NOT EXISTS (SELECT 1 FROM staff_assignments WHERE client_id = ${clientId})
        RETURNING id
      `;
      return rows.length
        ? { ok: true, consultantId: consultant.id, consultantName: consultant.name }
        : { ok: false, reason: "already" };
    },
    { ok: false, reason: "invalid" } as EnrolByCode
  );
}

/** For Settings: this person's own code (staff) and their consultant (clients). */
export async function codeContext(
  userId: string
): Promise<{ ownCode: string | null; consultantName: string | null }> {
  return safeQuery(
    async () => {
      const [row] = await db()`
        SELECT u.consultant_code,
          (SELECT a.name FROM staff_assignments sa JOIN users a ON a.id = sa.advisor_id
            WHERE sa.client_id = u.id ORDER BY sa.created_at ASC LIMIT 1) AS consultant_name
        FROM users u WHERE u.id = ${userId}
      `;
      return {
        ownCode: row?.consultant_code ? String(row.consultant_code) : null,
        consultantName: row?.consultant_name ? String(row.consultant_name) : null,
      };
    },
    { ownCode: null, consultantName: null }
  );
}

/** For the client file: who this client's consultant is, and who could be. */
export async function consultantChoices(
  clientId: string
): Promise<{ currentId: string | null; advisors: { id: string; name: string; code: string | null }[] }> {
  return safeQuery(
    async () => {
      const [r] = await db()`
        SELECT
          (SELECT sa.advisor_id FROM staff_assignments sa WHERE sa.client_id = ${clientId}
            ORDER BY sa.created_at ASC LIMIT 1) AS current_id,
          COALESCE((SELECT json_agg(x ORDER BY x.name) FROM (
            SELECT id, name, consultant_code AS code FROM users
             WHERE role IN ('advisor', 'admin', 'super_admin') AND status = 'active'
          ) x), '[]'::json) AS advisors
      `;
      return {
        currentId: r?.current_id ? String(r.current_id) : null,
        advisors: (r?.advisors ?? []) as { id: string; name: string; code: string | null }[],
      };
    },
    { currentId: null, advisors: [] }
  );
}

import { db, safeQuery } from "../client";
import type { Role } from "@/lib/auth/types";

/**
 * PORTAL REPOSITORY
 * ---------------------------------------------------------------------------
 * Every read here is SCOPED IN SQL, not filtered in the component. A client
 * query always carries `client_id = $viewer`, an advisor query always joins
 * staff_assignments. That way an authorization mistake in the UI cannot leak
 * another client's data — the row never leaves the database.
 */

/* ------------------------------------------------------------------ types */

export type CaseRow = {
  id: string;
  /**
   * SNZ-YYYY-NNNN. Generated for every case since 003 and, until now, shown
   * nowhere — which made it useless for the thing it exists for: naming a case
   * in an email or on the phone without reading out a UUID.
   */
  reference: string | null;
  clientId: string;
  clientName: string;
  advisorId: string | null;
  advisorName: string | null;
  /**
   * The consultant the CLIENT is assigned to, which is a different fact from
   * the advisor on the case.
   *
   * Nothing sets `cases.advisor_id` when a consultant enrols a student — that
   * is a separate, manual assignment — so the Advisor column read "—" for
   * every case even where the student plainly had somebody. The honest answer
   * to "whose is this" is the client's consultant, so it is fetched too and
   * the column falls back to it.
   */
  consultantName: string | null;
  /** Null when the client has no photo; otherwise its version. */
  clientAvatarV?: number | null;
  /** The application this case was opened from, when there is one. */
  intakeId?: string | null;
  pathway: "study" | "career" | "business";
  title: string;
  country: string | null;
  status: string;
  priority: string;
  stageIndex: number;
  nextAction: string | null;
  updatedAt: string;
};

export type DocumentRow = {
  id: string;
  ownerId: string;
  ownerName?: string;
  name: string;
  category: string;
  status: string;
  storageKey: string | null;
  storageProvider: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /**
   * The reviewer's note. Surfaced to the client ONLY for statuses that ask
   * them to act (rejected / needs_update) — see app/portal/documents/page.tsx.
   * An approval note is an internal remark and stays internal.
   */
  reviewNote: string | null;
  updatedAt: string;
};

export type TaskRow = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  caseId: string | null;
};

export type AppointmentRow = {
  id: string;
  type: string;
  startsAt: string | null;
  status: string;
  advisorName: string | null;
  clientName?: string;
  notes: string | null;
};

export type ConversationRow = {
  id: string;
  subject: string;
  updatedAt: string;
  unread: number;
  clientName?: string;
  /** Whose conversation it is; for staff, their own means "from the firm". */
  clientId?: string;
  clientRole?: string;
  clientEmail?: string;
  clientAvatarV?: number | null;
  /** The newest message, for the preview line. */
  lastBody?: string | null;
  /** True when the client wrote last, i.e. it is waiting on the team. */
  lastFromClient?: boolean;
};

export type MessageRow = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
  /** message, document, status, appointment, task or general. */
  kind: string;
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/* ------------------------------------------------------------------ cases */

export async function getCasesForClient(clientId: string): Promise<CaseRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.*, u.name AS client_name, a.name AS advisor_name,
             cons.name AS consultant_name,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS client_avatar_v,
             (SELECT i.id FROM intake_forms i
               WHERE i.case_id = c.id
                  OR (i.user_id = c.client_id AND i.pathway = c.pathway::text)
               ORDER BY (i.case_id = c.id) DESC NULLS LAST LIMIT 1) AS intake_id
      FROM cases c
      JOIN users u ON u.id = c.client_id
      LEFT JOIN users a ON a.id = c.advisor_id
      /* Their consultant, for the same reason as in getAllCases. */
      LEFT JOIN LATERAL (
        SELECT adv.name
        FROM staff_assignments sa
        JOIN users adv ON adv.id = sa.advisor_id
        WHERE sa.client_id = c.client_id
        ORDER BY sa.created_at ASC
        LIMIT 1
      ) cons ON TRUE
      WHERE c.client_id = ${clientId}
      ORDER BY c.updated_at DESC
    `;
    return rows.map(mapCase);
  }, []);
}

/** Advisor view — only cases explicitly assigned to them. */
export async function getCasesForAdvisor(advisorId: string): Promise<CaseRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.*, u.name AS client_name, a.name AS advisor_name,
             cons.name AS consultant_name,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS client_avatar_v,
             (SELECT i.id FROM intake_forms i
               WHERE i.case_id = c.id
                  OR (i.user_id = c.client_id AND i.pathway = c.pathway::text)
               ORDER BY (i.case_id = c.id) DESC NULLS LAST LIMIT 1) AS intake_id
      FROM cases c
      JOIN users u ON u.id = c.client_id
      LEFT JOIN users a ON a.id = c.advisor_id
      /*
        The client's consultant. LATERAL with LIMIT 1 because
        staff_assignments permits several advisors on one client, and a plain
        join would duplicate the case.
      */
      LEFT JOIN LATERAL (
        SELECT adv.name
        FROM staff_assignments sa
        JOIN users adv ON adv.id = sa.advisor_id
        WHERE sa.client_id = c.client_id
        ORDER BY sa.created_at ASC
        LIMIT 1
      ) cons ON TRUE
      WHERE c.advisor_id = ${advisorId}
         OR EXISTS (
           SELECT 1 FROM staff_assignments sa
           WHERE sa.advisor_id = ${advisorId} AND sa.client_id = c.client_id
         )
      ORDER BY c.updated_at DESC
    `;
    return rows.map(mapCase);
  }, []);
}

export async function getAllCases(limit = 100): Promise<CaseRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.*, u.name AS client_name, a.name AS advisor_name,
             cons.name AS consultant_name,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS client_avatar_v,
             (SELECT i.id FROM intake_forms i
               WHERE i.case_id = c.id
                  OR (i.user_id = c.client_id AND i.pathway = c.pathway::text)
               ORDER BY (i.case_id = c.id) DESC NULLS LAST LIMIT 1) AS intake_id
      FROM cases c
      JOIN users u ON u.id = c.client_id
      LEFT JOIN users a ON a.id = c.advisor_id
      /*
        The client's consultant. LATERAL with LIMIT 1 because
        staff_assignments permits several advisors on one client, and a plain
        join would duplicate the case.
      */
      LEFT JOIN LATERAL (
        SELECT adv.name
        FROM staff_assignments sa
        JOIN users adv ON adv.id = sa.advisor_id
        WHERE sa.client_id = c.client_id
        ORDER BY sa.created_at ASC
        LIMIT 1
      ) cons ON TRUE
      ORDER BY c.updated_at DESC LIMIT ${limit}
    `;
    return rows.map(mapCase);
  }, []);
}

function mapCase(r: Record<string, unknown>): CaseRow {
  return {
    id: String(r.id),
    reference: r.reference ? String(r.reference) : null,
    clientId: String(r.client_id),
    clientName: String(r.client_name ?? ""),
    advisorId: r.advisor_id ? String(r.advisor_id) : null,
    advisorName: r.advisor_name ? String(r.advisor_name) : null,
    consultantName: r.consultant_name ? String(r.consultant_name) : null,
    clientAvatarV: r.client_avatar_v == null ? null : Number(r.client_avatar_v),
    intakeId: r.intake_id ? String(r.intake_id) : null,
    pathway: r.pathway as CaseRow["pathway"],
    title: String(r.title),
    country: r.country ? String(r.country) : null,
    status: String(r.status),
    priority: String(r.priority),
    stageIndex: Number(r.stage_index ?? 0),
    nextAction: r.next_action ? String(r.next_action) : null,
    updatedAt: iso(r.updated_at)!,
  };
}

/** True when the viewer may see this case. Enforced server-side, always. */
/** One case, with the owner needed to scope an advisor's permission. */
export async function getCaseById(id: string): Promise<CaseRow | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.*, u.name AS client_name, a.name AS advisor_name
      FROM cases c
      JOIN users u ON u.id = c.client_id
      LEFT JOIN users a ON a.id = c.advisor_id
      WHERE c.id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapCase(rows[0]) : null;
  }, null);
}

export async function canAccessCase(
  caseId: string,
  viewerId: string,
  role: Role
): Promise<boolean> {
  if (role === "admin" || role === "super_admin") return true;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT 1 FROM cases c
      WHERE c.id = ${caseId}
        AND (
          c.client_id = ${viewerId}
          OR c.advisor_id = ${viewerId}
          OR EXISTS (
            SELECT 1 FROM staff_assignments sa
            WHERE sa.advisor_id = ${viewerId} AND sa.client_id = c.client_id
          )
        )
      LIMIT 1
    `;
    return rows.length > 0;
  }, false);
}

export async function updateCaseStatus(
  caseId: string,
  status: string,
  nextAction: string | null
): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE cases SET status = ${status}::case_status,
                       next_action = ${nextAction},
                       updated_at = now()
      WHERE id = ${caseId}
      RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

export async function assignAdvisorToCase(caseId: string, advisorId: string | null) {
  await db()`
    UPDATE cases SET advisor_id = ${advisorId}, updated_at = now() WHERE id = ${caseId}
  `;
}

/* -------------------------------------------------------------- documents */

export async function getDocumentsForOwner(ownerId: string): Promise<DocumentRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT * FROM documents WHERE owner_id = ${ownerId} ORDER BY created_at DESC
    `;
    return rows.map(mapDocument);
  }, []);
}

export async function getDocumentsForReview(limit = 100): Promise<DocumentRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT d.*, u.name AS owner_name FROM documents d
      JOIN users u ON u.id = d.owner_id
      WHERE d.status IN ('uploaded','pending_review')
      ORDER BY d.updated_at DESC LIMIT ${limit}
    `;
    return rows.map(mapDocument);
  }, []);
}

export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  return safeQuery(async () => {
    const rows = await db()`SELECT * FROM documents WHERE id = ${id} LIMIT 1`;
    return rows[0] ? mapDocument(rows[0]) : null;
  }, null);
}

function mapDocument(r: Record<string, unknown>): DocumentRow {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    ownerName: r.owner_name ? String(r.owner_name) : undefined,
    name: String(r.name),
    category: String(r.category),
    status: String(r.status),
    storageKey: r.storage_key ? String(r.storage_key) : null,
    storageProvider: r.storage_provider ? String(r.storage_provider) : null,
    mimeType: r.mime_type ? String(r.mime_type) : null,
    sizeBytes: r.size_bytes ? Number(r.size_bytes) : null,
    reviewNote: r.review_note ? String(r.review_note) : null,
    updatedAt: iso(r.updated_at)!,
  };
}

export async function createDocument(input: {
  ownerId: string;
  name: string;
  category: string;
  storageKey: string;
  /* Written alongside the key, never inferred later. See migration 009. */
  storageProvider: string;
  mimeType: string;
  sizeBytes: number;
  caseId?: string | null;
}) {
  const rows = await db()`
    INSERT INTO documents (owner_id, case_id, name, category, status, storage_key,
                           storage_provider, mime_type, size_bytes)
    VALUES (${input.ownerId}, ${input.caseId ?? null}, ${input.name}, ${input.category},
            'uploaded', ${input.storageKey}, ${input.storageProvider},
            ${input.mimeType}, ${input.sizeBytes})
    RETURNING id
  `;
  return String(rows[0].id);
}

export async function reviewDocument(
  id: string,
  status: "approved" | "rejected" | "needs_update",
  reviewerId: string,
  note: string | null
) {
  await db()`
    UPDATE documents
    SET status = ${status}::document_status, reviewed_by = ${reviewerId},
        reviewed_at = now(), review_note = ${note}, updated_at = now()
    WHERE id = ${id}
  `;
}

/**
 * Approve every document this student has uploaded that is still waiting.
 * Already approved, rejected or returned files are left as they are. Returns
 * how many were approved.
 */
export async function approveAllDocuments(ownerId: string, reviewerId: string): Promise<number> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE documents
      SET status = 'approved'::document_status, reviewed_by = ${reviewerId},
          reviewed_at = now(), review_note = NULL, updated_at = now()
      WHERE owner_id = ${ownerId}
        AND storage_key IS NOT NULL
        AND status IN ('uploaded', 'pending_review')
      RETURNING id
    `;
    return rows.length;
  }, 0);
}

export async function deleteDocument(id: string) {
  await db()`DELETE FROM documents WHERE id = ${id}`;
}

/* ------------------------------------------------------------------ tasks */

export async function getTasksForUser(userId: string): Promise<TaskRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT id, title, detail, status, priority, due_at, case_id
      FROM tasks WHERE assignee_id = ${userId} AND status <> 'cancelled'
      ORDER BY (status = 'done'), due_at NULLS LAST, created_at
    `;
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      detail: r.detail ? String(r.detail) : null,
      status: String(r.status),
      priority: String(r.priority),
      dueAt: iso(r.due_at),
      caseId: r.case_id ? String(r.case_id) : null,
    }));
  }, []);
}

export async function setTaskStatus(id: string, status: string) {
  await db()`
    UPDATE tasks SET status = ${status}::task_status, updated_at = now() WHERE id = ${id}
  `;
}

export async function taskBelongsTo(id: string, userId: string): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`SELECT 1 FROM tasks WHERE id = ${id} AND assignee_id = ${userId} LIMIT 1`;
    return rows.length > 0;
  }, false);
}

/* ----------------------------------------------------------- appointments */

export async function getAppointmentsForClient(clientId: string): Promise<AppointmentRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT ap.*, a.name AS advisor_name FROM appointments ap
      LEFT JOIN users a ON a.id = ap.advisor_id
      WHERE ap.client_id = ${clientId}
      ORDER BY ap.starts_at NULLS LAST, ap.created_at DESC
    `;
    return rows.map(mapAppointment);
  }, []);
}

export async function getAppointmentsForAdvisor(advisorId: string): Promise<AppointmentRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT ap.*, a.name AS advisor_name, c.name AS client_name
      FROM appointments ap
      LEFT JOIN users a ON a.id = ap.advisor_id
      JOIN users c ON c.id = ap.client_id
      WHERE ap.advisor_id = ${advisorId}
         OR EXISTS (SELECT 1 FROM staff_assignments sa
                    WHERE sa.advisor_id = ${advisorId} AND sa.client_id = ap.client_id)
      ORDER BY ap.starts_at NULLS LAST
    `;
    return rows.map(mapAppointment);
  }, []);
}

function mapAppointment(r: Record<string, unknown>): AppointmentRow {
  return {
    id: String(r.id),
    type: String(r.type),
    startsAt: iso(r.starts_at),
    status: String(r.status),
    advisorName: r.advisor_name ? String(r.advisor_name) : null,
    clientName: r.client_name ? String(r.client_name) : undefined,
    notes: r.notes ? String(r.notes) : null,
  };
}

export async function requestAppointment(input: {
  clientId: string;
  type: string;
  notes: string | null;
}) {
  const rows = await db()`
    INSERT INTO appointments (client_id, type, notes, status)
    VALUES (${input.clientId}, ${input.type}, ${input.notes}, 'requested')
    RETURNING id
  `;
  return String(rows[0].id);
}

/* -------------------------------------------------------------- messaging */

export async function getConversationsForClient(clientId: string): Promise<ConversationRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT c.id, c.subject, c.updated_at,
             (SELECT count(*)::int FROM messages m
              WHERE m.conversation_id = c.id AND m.read_at IS NULL
                AND m.author_id <> ${clientId}) AS unread
      FROM conversations c
      WHERE c.client_id = ${clientId}
      ORDER BY c.updated_at DESC
    `;
    return rows.map((r) => ({
      id: String(r.id),
      subject: String(r.subject),
      updatedAt: iso(r.updated_at)!,
      unread: Number(r.unread ?? 0),
    }));
  }, []);
}

export async function getConversationsForStaff(
  staffId: string,
  isAdmin: boolean
): Promise<ConversationRow[]> {
  return safeQuery(async () => {
    const rows = isAdmin
      ? await db()`
          SELECT c.id, c.subject, c.updated_at, u.name AS client_name, c.client_id,
                 u.role::text AS client_role, u.email AS client_email,
                 CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::int END AS client_avatar_v,
                 (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                 (SELECT m.author_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_author,
                 (SELECT count(*)::int FROM messages m
                  WHERE m.conversation_id = c.id AND m.read_at IS NULL
                    AND m.author_id = c.client_id) AS unread
          FROM conversations c JOIN users u ON u.id = c.client_id
          ORDER BY c.updated_at DESC LIMIT 100
        `
      : await db()`
          SELECT c.id, c.subject, c.updated_at, u.name AS client_name, c.client_id,
                 u.role::text AS client_role, u.email AS client_email,
                 CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::int END AS client_avatar_v,
                 (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                 (SELECT m.author_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_author,
                 (SELECT count(*)::int FROM messages m
                  WHERE m.conversation_id = c.id AND m.read_at IS NULL
                    AND m.author_id = c.client_id) AS unread
          FROM conversations c JOIN users u ON u.id = c.client_id
          -- Their students' threads, and their own (a message from the firm).
          WHERE c.client_id = ${staffId}
             OR EXISTS (SELECT 1 FROM staff_assignments sa
                        WHERE sa.advisor_id = ${staffId} AND sa.client_id = c.client_id)
          ORDER BY c.updated_at DESC LIMIT 100
        `;
    return rows.map((r) => ({
      id: String(r.id),
      subject: String(r.subject),
      updatedAt: iso(r.updated_at)!,
      unread: Number(r.unread ?? 0),
      clientName: r.client_name ? String(r.client_name) : undefined,
      clientId: r.client_id ? String(r.client_id) : undefined,
      clientRole: r.client_role ? String(r.client_role) : undefined,
      clientEmail: r.client_email ? String(r.client_email) : undefined,
      clientAvatarV: r.client_avatar_v == null ? null : Number(r.client_avatar_v),
      lastBody: r.last_body ? String(r.last_body) : null,
      lastFromClient: r.last_author != null && String(r.last_author) === String(r.client_id),
    }));
  }, []);
}

export async function canAccessConversation(
  conversationId: string,
  viewerId: string,
  role: Role
): Promise<boolean> {
  if (role === "admin" || role === "super_admin") return true;
  return safeQuery(async () => {
    const rows = await db()`
      SELECT 1 FROM conversations c
      WHERE c.id = ${conversationId}
        AND (c.client_id = ${viewerId}
             OR EXISTS (SELECT 1 FROM staff_assignments sa
                        WHERE sa.advisor_id = ${viewerId} AND sa.client_id = c.client_id))
      LIMIT 1
    `;
    return rows.length > 0;
  }, false);
}

export async function getMessages(conversationId: string): Promise<MessageRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT m.*, u.name AS author_name, u.role AS author_role
      FROM messages m JOIN users u ON u.id = m.author_id
      WHERE m.conversation_id = ${conversationId}
      ORDER BY m.created_at
    `;
    return rows.map((r) => ({
      id: String(r.id),
      authorId: String(r.author_id),
      authorName: String(r.author_name),
      authorRole: r.author_role as Role,
      body: String(r.body),
      createdAt: iso(r.created_at)!,
      readAt: iso(r.read_at),
    }));
  }, []);
}

export async function createConversation(input: {
  clientId: string;
  subject: string;
}): Promise<string | null> {
  return safeQuery(async () => {
    const rows = await db()`
      INSERT INTO conversations (client_id, subject)
      VALUES (${input.clientId}, ${input.subject}) RETURNING id
    `;
    return String(rows[0].id);
  }, null);
}

export async function postMessage(input: {
  conversationId: string;
  authorId: string;
  body: string;
}) {
  await db().begin(async (tx) => {
    await tx`
      INSERT INTO messages (conversation_id, author_id, body)
      VALUES (${input.conversationId}, ${input.authorId}, ${input.body})
    `;
    // `last_sender_id` (003) is what lets the staff queue separate "waiting on
    // us" from "waiting on them" without opening every thread.
    await tx`
      UPDATE conversations
         SET updated_at = now(), last_sender_id = ${input.authorId}
       WHERE id = ${input.conversationId}
    `;
  });
}

/** Who a conversation belongs to. Used to address a reply notification. */
export async function conversationOwner(conversationId: string): Promise<string | null> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT client_id FROM conversations WHERE id = ${conversationId}
    `;
    return rows.length ? String(rows[0].client_id) : null;
  }, null);
}

/**
 * Clearing the unread badge is a SIDE EFFECT of opening a thread, and it runs
 * during a page render. Wrapped, because a page must never fail — or worse,
 * hang on an unhandled rejection — because a bookkeeping update did. The reader
 * still sees their messages; the badge simply clears on the next visit.
 */
export async function markConversationRead(conversationId: string, viewerId: string) {
  await safeQuery(async () => {
    await db()`
      UPDATE messages SET read_at = now()
      WHERE conversation_id = ${conversationId}
        AND author_id <> ${viewerId} AND read_at IS NULL
    `;
    return true;
  }, false);
}

/* ---------------------------------------------------------- notifications */

export async function getNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT * FROM notifications WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      body: r.body ? String(r.body) : null,
      href: r.href ? String(r.href) : null,
      kind: r.kind ? String(r.kind) : "general",
      read: Boolean(r.read_at),
      createdAt: iso(r.created_at)!,
    }));
  }, []);
}

/**
 * TELL STAFF THAT A CLIENT DID SOMETHING.
 * ---------------------------------------------------------------------------
 * Staff had no feed at all. Every notification in the product went to a
 * client — "your fee is verified", "your document was approved" — and nothing
 * went the other way, so finding out that somebody had uploaded a passport at
 * midnight meant opening the documents page and looking.
 *
 * ONE QUERY, WHATEVER THE HEADCOUNT. An INSERT ... SELECT writes a row for
 * every recipient in a single round trip. Looping over staff would be one trip
 * each on the single connection a serverless function gets, which is the shape
 * that has produced gateway timeouts here repeatedly.
 *
 * A ROW EACH, not one shared row, because read state is personal: an advisor
 * marking something read must not clear it from an admin's bell.
 *
 * WHO GETS IT: every active admin and super admin, plus the advisor assigned
 * to that client — they are the person who actually acts on it, and they are
 * often neither. The ACTOR is excluded: a member of staff who has just done
 * something does not need to be told they did it, which also keeps the bell
 * quiet during a view-as.
 */
export async function notifyStaff(input: {
  title: string;
  body?: string;
  href?: string;
  kind?: "message" | "document" | "status" | "task" | "appointment" | "general";
  /** The client this is about, so their advisor is included. */
  aboutUserId?: string;
  /** Whoever caused it, so they are not told about their own action. */
  actorId?: string;
  /**
   * Suppress an identical title for the same person within this many minutes.
   *
   * Some things happen once — a receipt, a submitted application — and some
   * happen continuously. The profile form autosaves as somebody types, and a
   * notification per save would put forty rows in the bell for one sitting.
   * A bell that cries forty times is a bell nobody opens, which costs the
   * notifications that mattered.
   *
   * The window is applied in the same statement, so it stays one round trip.
   */
  dedupeWithinMinutes?: number;
}) {
  await safeQuery(async () => {
    await db()`
      INSERT INTO notifications (user_id, title, body, href, kind)
      SELECT u.id, ${input.title}, ${input.body ?? null}, ${input.href ?? null},
             ${input.kind ?? "general"}
        FROM users u
       WHERE u.status = 'active'
         AND (
           u.role IN ('admin', 'super_admin')
           OR u.id IN (
             SELECT a.advisor_id FROM staff_assignments a
              WHERE a.client_id = ${input.aboutUserId ?? null}
           )
         )
         AND u.id <> ${input.actorId ?? null}
         AND (
           ${input.dedupeWithinMinutes ?? null}::int IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM notifications n
              WHERE n.user_id = u.id
                AND n.title = ${input.title}
                AND n.created_at > now() - make_interval(mins => ${input.dedupeWithinMinutes ?? 0})
           )
         )
    `;
    return true;
  }, false);
}

export async function notify(input: {
  userId: string;
  title: string;
  body?: string;
  href?: string;
  /** Groups the bell and gives notification preferences something to match. */
  kind?: "message" | "document" | "status" | "task" | "appointment" | "general";
}) {
  await safeQuery(async () => {
    await db()`
      INSERT INTO notifications (user_id, title, body, href, kind)
      VALUES (${input.userId}, ${input.title}, ${input.body ?? null},
              ${input.href ?? null}, ${input.kind ?? "general"})
    `;
    return true;
  }, false);
}

/**
 * EVERY SIDEBAR BADGE IN ONE ROUND TRIP.
 *
 * These were four separate calls behind a Promise.all. On a `max: 1` pool they
 * serialise, so that was four network round trips on every single portal page —
 * and when the function runs in one region while the database sits in another,
 * four round trips is the difference between a page and a gateway timeout.
 *
 * Postgres evaluates scalar subqueries in one pass, so this costs one trip and
 * returns the same four numbers.
 */
export async function getSidebarBadges(
  userId: string,
  role: Role
): Promise<{
  messages: number; notifications: number; documents: number; tasks: number;
  enquiries: number; fees: number; review: number; ready: number;
  avatarV: number | null;
  /** Employee access (030): null means unrestricted. */
  permissions: string[] | null;
}> {
  const staffWide = role === "admin" || role === "super_admin";

  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        (
          SELECT count(*)::int FROM messages m
          WHERE m.read_at IS NULL AND m.author_id <> ${userId}
            AND (
              ${staffWide}::boolean
              OR EXISTS (
                SELECT 1 FROM conversations c
                WHERE c.id = m.conversation_id
                  AND (c.client_id = ${userId}
                       OR EXISTS (SELECT 1 FROM staff_assignments sa
                                  WHERE sa.advisor_id = ${userId}
                                    AND sa.client_id = c.client_id))
              )
            )
        ) AS messages,
        (
          SELECT count(*)::int FROM notifications n
          WHERE n.user_id = ${userId} AND n.read_at IS NULL
        ) AS notifications,
        (
          -- Staff see the review queue; a client sees only what was returned to
          -- THEM. Both branches are in SQL so the scoping cannot be lost in JS.
          SELECT count(*)::int FROM documents d
          WHERE (${staffWide}::boolean AND d.status IN ('uploaded','pending_review'))
             OR (NOT ${staffWide}::boolean
                 AND d.owner_id = ${userId}
                 AND d.status IN ('rejected','needs_update'))
        ) AS documents,
        (
          SELECT count(*)::int FROM tasks t
          WHERE t.assignee_id = ${userId} AND t.status <> 'done'
        ) AS tasks,
        -- The viewer's own photo version, here so the shell needs no second query.
        (
          SELECT CASE WHEN u.avatar_url IS NULL THEN NULL
                      ELSE floor(extract(epoch FROM u.updated_at))::int END
          FROM users u WHERE u.id = ${userId}
        ) AS avatar_v,
        (SELECT u.permissions FROM users u WHERE u.id = ${userId}) AS permissions,
        -- The pipeline queues, for admins only (zero for everyone else, so a
        -- consultant's sidebar never counts work that is not theirs).
        CASE WHEN ${staffWide}::boolean THEN
          (SELECT count(*)::int FROM enquiries WHERE handled_at IS NULL) ELSE 0 END AS q_enquiries,
        CASE WHEN ${staffWide}::boolean THEN
          (SELECT count(*)::int FROM fee_submissions WHERE status = 'submitted') ELSE 0 END AS q_fees,
        CASE WHEN ${staffWide}::boolean THEN
          (SELECT count(*)::int FROM intake_forms WHERE status IN ('submitted', 'under_review')) ELSE 0 END AS q_review,
        CASE WHEN ${staffWide}::boolean THEN
          (SELECT count(*)::int FROM intake_forms WHERE status = 'accepted') ELSE 0 END AS q_ready
    `;
    return {
      messages: Number(r?.messages ?? 0),
      notifications: Number(r?.notifications ?? 0),
      documents: Number(r?.documents ?? 0),
      tasks: Number(r?.tasks ?? 0),
      enquiries: Number(r?.q_enquiries ?? 0),
      fees: Number(r?.q_fees ?? 0),
      review: Number(r?.q_review ?? 0),
      ready: Number(r?.q_ready ?? 0),
      avatarV: r?.avatar_v == null ? null : Number(r.avatar_v),
      permissions: (r?.permissions as string[] | null) ?? null,
    };
  }, { messages: 0, notifications: 0, documents: 0, tasks: 0, enquiries: 0, fees: 0, review: 0, ready: 0, avatarV: null, permissions: null });
}

/** Unread count for the sidebar badge. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT count(*)::int AS n FROM notifications
      WHERE user_id = ${userId} AND read_at IS NULL
    `;
    return Number(rows[0]?.n ?? 0);
  }, 0);
}

/** Unread messages addressed to this viewer, across all their conversations. */
export async function countUnreadMessages(userId: string, role: Role): Promise<number> {
  return safeQuery(async () => {
    if (role === "admin" || role === "super_admin") {
      const rows = await db()`
        SELECT count(*)::int AS n FROM messages m
        WHERE m.read_at IS NULL AND m.author_id <> ${userId}
      `;
      return Number(rows[0]?.n ?? 0);
    }
    const rows = await db()`
      SELECT count(*)::int AS n
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.read_at IS NULL
        AND m.author_id <> ${userId}
        AND (c.client_id = ${userId}
             OR EXISTS (SELECT 1 FROM staff_assignments sa
                        WHERE sa.advisor_id = ${userId} AND sa.client_id = c.client_id))
    `;
    return Number(rows[0]?.n ?? 0);
  }, 0);
}

/** Same reasoning as markConversationRead — bookkeeping must not break a page. */
/**
 * Open one notification: mark it read (only if it is the caller's) and say
 * where it points. Null when it is not theirs.
 */
export async function openNotification(
  userId: string,
  id: string
): Promise<{ href: string | null; kind: string } | null> {
  return safeQuery(async () => {
    const [r] = await db()`
      UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = ${id} AND user_id = ${userId}
      RETURNING href, kind
    `;
    return r ? { href: r.href ? String(r.href) : null, kind: String(r.kind ?? "general") } : null;
  }, null);
}

export async function markNotificationsRead(userId: string) {
  await safeQuery(async () => {
    await db()`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${userId} AND read_at IS NULL
    `;
    return true;
  }, false);
}

/* --------------------------------------------------------- opportunities */

/**
 * Published opportunities of one kind.
 *
 * `opportunities.kind` already distinguishes a job from a programme from a
 * scholarship, so the student's Universities and Scholarships pages and the job
 * seeker's Jobs page are three views of one table rather than three tables. The
 * filter is in SQL so an unpublished row never leaves the database.
 */
export async function getOpportunitiesByKind(
  kind: "role" | "programme" | "scholarship",
  limit = 60
) {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT * FROM opportunities
      WHERE is_published = TRUE AND kind = ${kind}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      organisation: String(r.organisation),
      country: String(r.country),
      location: r.location ? String(r.location) : "",
      employment: r.employment ? String(r.employment) : "",
      industry: r.industry ? String(r.industry) : "",
      summary: r.summary ? String(r.summary) : "",
      requirements: Array.isArray(r.requirements) ? (r.requirements as string[]) : [],
    }));
  }, []);
}

export async function getPublishedOpportunities(limit = 60) {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT * FROM opportunities WHERE is_published = TRUE
      ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      organisation: String(r.organisation),
      country: String(r.country),
      location: r.location ? String(r.location) : "",
      type: r.employment ? String(r.employment) : "",
      industry: r.industry ? String(r.industry) : "",
      summary: r.summary ? String(r.summary) : "",
      requirements: (r.requirements as string[] | null) ?? [],
    }));
  }, []);
}

/* ------------------------------------------------------ staff assignment */

/**
 * A client's consultant, SET rather than added: every existing assignment is
 * removed and this one put in its place, in one transaction. Adding meant a
 * "change" left the old consultant attached too, so the student showed in
 * both consultants' lists and the file kept naming the old one.
 */
export async function assignAdvisor(clientId: string, advisorId: string, assignedBy: string) {
  await db().begin(async (tx) => {
    await tx`DELETE FROM staff_assignments WHERE client_id = ${clientId} AND advisor_id <> ${advisorId}`;
    await tx`
      INSERT INTO staff_assignments (client_id, advisor_id, assigned_by)
      VALUES (${clientId}, ${advisorId}, ${assignedBy})
      ON CONFLICT (client_id, advisor_id) DO NOTHING
    `;
  });
}

/** Direct (no consultant): every assignment for this client goes. */
export async function unassignAdvisor(clientId: string, _advisorId?: string) {
  await db()`DELETE FROM staff_assignments WHERE client_id = ${clientId}`;
}

/**
 * Advisors WITH their client counts, in one statement.
 *
 * The staff page did `advisors.map(a => getAssignedClients(a.id))` — one query
 * per advisor, the textbook N+1. Twenty advisors meant twenty round trips, and
 * it grew with every hire. A LEFT JOIN and a GROUP BY answers it once.
 */
export type AdvisorLoad = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  clientCount: number;
  openCases: number;
  /** Cases stalled on the student rather than on us. */
  needsAttention: number;
  lastLoginAt: string | null;
  avatarV?: number | null;
  consultantCode?: string | null;
  memberNo?: number | null;
  /** Employee access (030); null = unrestricted. */
  permissions?: string[] | null;
};

export async function getAdvisorsWithLoad(): Promise<AdvisorLoad[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.consultant_code, u.member_no, u.permissions,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::int END AS avatar_v,
             count(DISTINCT sa.client_id)::int AS client_count,
             count(DISTINCT c.id) FILTER (
               WHERE c.status NOT IN ('completed','closed')
             )::int AS open_cases,
             /*
               Waiting on the STUDENT, not on us. It is the number a consultant
               can actually act on — everything else is in our queue, and
               showing it next to their name would read as a reproach for work
               that is not theirs.
             */
             count(DISTINCT c.id) FILTER (
               WHERE c.status IN ('documents_required','awaiting_client')
             )::int AS needs_attention
      FROM users u
      LEFT JOIN staff_assignments sa ON sa.advisor_id = u.id
      LEFT JOIN cases c ON c.advisor_id = u.id
      WHERE u.role IN ('advisor','admin','super_admin')
      GROUP BY u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.avatar_url, u.updated_at, u.consultant_code, u.member_no, u.permissions
      ORDER BY u.name
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      role: r.role as Role,
      status: String(r.status),
      clientCount: Number(r.client_count ?? 0),
      openCases: Number(r.open_cases ?? 0),
      needsAttention: Number(r.needs_attention ?? 0),
      lastLoginAt: iso(r.last_login_at),
      avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
      consultantCode: r.consultant_code ? String(r.consultant_code) : null,
      memberNo: r.member_no == null ? null : Number(r.member_no),
      permissions: (r.permissions as string[] | null) ?? null,
    }));
  }, []);
}

export type StaffProfile = {
  userId: string;
  phone: string | null;
  company: string | null;
  addressLine: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
};

/**
 * The contact block for every staff account, in one statement.
 *
 * Loaded with the Consultants page for the same reason their students are:
 * the panel opens on click and a spinner over six fields reads as broken
 * rather than as loading. There is one row per staff member at most, so the
 * whole set is smaller than a single case.
 */
export async function getStaffProfiles(): Promise<StaffProfile[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT p.user_id, p.phone, p.company, p.address_line, p.city, p.postcode, p.country
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      WHERE u.role IN ('advisor','admin','super_admin')
    `;
    return rows.map((r) => ({
      userId: String(r.user_id),
      phone: r.phone ? String(r.phone) : null,
      company: r.company ? String(r.company) : null,
      addressLine: r.address_line ? String(r.address_line) : null,
      city: r.city ? String(r.city) : null,
      postcode: r.postcode ? String(r.postcode) : null,
      country: r.country ? String(r.country) : null,
    }));
  }, []);
}

export type AdvisorClient = {
  advisorId: string;
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  openCases: number;
};

/**
 * Every staff member's clients, in ONE statement.
 *
 * For the panel that opens beside a consultant: with six consultants holding
 * eight students each, fetching per consultant is forty-eight round trips to
 * fill a list nobody has clicked yet — and fetching on click means the panel
 * has a loading state for a table of eight rows. One query is smaller than
 * either.
 *
 * Returns a flat list because grouping is the caller's business and doing it
 * here would mean inventing a shape the database does not have.
 */
export async function getClientsByAdvisor(): Promise<AdvisorClient[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT sa.advisor_id, u.id, u.name, u.email, u.role, u.status,
             count(DISTINCT c.id) FILTER (
               WHERE c.status NOT IN ('completed','closed')
             )::int AS open_cases
      FROM staff_assignments sa
      JOIN users u ON u.id = sa.client_id
      LEFT JOIN cases c ON c.client_id = u.id
      GROUP BY sa.advisor_id, u.id, u.name, u.email, u.role, u.status
      ORDER BY u.name
    `;
    return rows.map((r) => ({
      advisorId: String(r.advisor_id),
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      role: r.role as Role,
      status: String(r.status),
      openCases: Number(r.open_cases ?? 0),
    }));
  }, []);
}

/**
 * WHOSE CLIENTS ARE MINE — the single definition.
 *
 * This is both the list behind Your Students and the authorization check
 * behind the client file, the document reads and the .zip export. Those must
 * be the same set or one screen shows a name the next one 404s on.
 *
 * TWO WAYS A CLIENT BECOMES YOURS, and this used to count only the first:
 *
 *   1. staff_assignments — how enrolment through your link records it, and
 *      how an admin hands a client over.
 *   2. a case whose advisor_id is you — a deliberate, explicit assignment of
 *      that piece of work by an admin.
 *
 * getCasesForAdvisor has always honoured both, so a case assigned to an
 * advisor appeared in their Cases list while its student appeared in their
 * student list nowhere: the two screens counted different things and the
 * difference read as missing data. It was the second rule, missing here.
 *
 * Widening this widens document access, deliberately: somebody given a case
 * cannot work it without the file, and the grant is an admin's explicit act,
 * not something enrolment or registration can produce on its own.
 *
 * The case counts come back with the row so the page can show WHY a student
 * count and a case count differ — one student with two cases is not a missing
 * student, and a table that shows only names cannot say so.
 */
export async function getAssignedClients(advisorId: string) {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::bigint END AS avatar_v,
             count(c.id)::int AS case_count,
             count(c.id) FILTER (
               WHERE c.status NOT IN ('completed','closed')
             )::int AS open_cases,
             min(c.reference) AS first_reference,
             (SELECT f.status::text FROM intake_forms f WHERE f.user_id = u.id
               ORDER BY f.updated_at DESC LIMIT 1) AS application_status
      FROM users u
      /*
        ONLY THE CASES THIS ADVISOR CAN SEE, which is the same condition
        getCasesForAdvisor uses. Counting all of a client's cases here would
        make these numbers disagree with the Cases page again, in the other
        direction — the exact bug this is fixing.
      */
      LEFT JOIN cases c
        ON c.client_id = u.id
       AND (c.advisor_id = ${advisorId}
            OR EXISTS (
              SELECT 1 FROM staff_assignments sa2
              WHERE sa2.advisor_id = ${advisorId} AND sa2.client_id = u.id
            ))
      WHERE EXISTS (
              SELECT 1 FROM staff_assignments sa
              WHERE sa.advisor_id = ${advisorId} AND sa.client_id = u.id
            )
         OR EXISTS (
              SELECT 1 FROM cases mine
              WHERE mine.advisor_id = ${advisorId} AND mine.client_id = u.id
            )
      GROUP BY u.id, u.name, u.email, u.role, u.status, u.created_at, u.avatar_url, u.updated_at
      ORDER BY u.name
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      email: String(r.email),
      role: r.role as Role,
      status: String(r.status),
      createdAt: iso(r.created_at)!,
      caseCount: Number(r.case_count ?? 0),
      openCases: Number(r.open_cases ?? 0),
      firstReference: r.first_reference ? String(r.first_reference) : null,
      applicationStatus: r.application_status ? String(r.application_status) : null,
      avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
    }));
  }, []);
}

/* ------------------------------------------------------------- dashboard */

export type AdminMetrics = {
  totalUsers: number;
  students: number;
  professionals: number;
  businesses: number;
  /** Every staff account: advisors, admins and super admins. */
  advisors: number;
  /**
   * Consultants ONLY. Kept apart from `advisors` because that counts everyone
   * who works the operational side, and "how many consultants do we have" is a
   * different question with a different answer — an admin is not one.
   */
  consultants: number;
  openCases: number;
  pendingDocuments: number;
  applications: number;
  appointments: number;
  unreadMessages: number;
};

/**
 * THE WHOLE ADMIN DASHBOARD IN ONE ROUND TRIP.
 *
 * It used to issue five reads through Promise.all — metrics, recent cases,
 * documents awaiting review, recent users, plus the layout's badges. Every
 * other admin page issues two and returned in under half a second; this one
 * timed out at thirty in production, every time, with no error logged.
 *
 * The cause was connection starvation, not slow SQL. Supabase's transaction
 * pooler accepts the TCP and TLS handshake before it has a backend to give
 * you, so a starved connection looks CONNECTED and the query simply never
 * starts. `connect_timeout` has already been satisfied and `statement_timeout`
 * never begins counting, so nothing fires — the request hangs until the
 * platform kills it. That is why the logs showed a timeout and no database
 * error.
 *
 * Returning everything as JSON from one statement means one connection and one
 * round trip, which removes the condition entirely rather than tuning around
 * it. Every figure is still a real COUNT over real rows.
 */
/**
 * Query analytics — status distribution and weekly volume, in one round trip.
 *
 * Bounded to twelve weeks so the result set cannot grow with the table. Both
 * aggregations are computed by Postgres rather than by pulling rows and
 * counting them in JavaScript, which is the version that stops working once
 * there are real numbers of records.
 */
export async function getQueryAnalytics(): Promise<{
  byStatus: { key: string; count: number }[];
  overTime: { week: string; count: number }[];
}> {
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        COALESCE((
          SELECT json_agg(x) FROM (
            SELECT status::text AS key, count(*)::int AS count
            FROM intake_forms
            GROUP BY status
            ORDER BY count(*) DESC
          ) x
        ), '[]'::json) AS by_status,

        COALESCE((
          SELECT json_agg(x) FROM (
            SELECT to_char(date_trunc('week', submitted_at), 'YYYY-MM-DD') AS week,
                   count(*)::int AS count
            FROM intake_forms
            WHERE submitted_at IS NOT NULL
              AND submitted_at >= now() - interval '12 weeks'
            GROUP BY date_trunc('week', submitted_at)
            ORDER BY date_trunc('week', submitted_at)
          ) x
        ), '[]'::json) AS over_time
    `;
    return {
      byStatus: ((r?.by_status ?? []) as { key: string; count: number }[]) ?? [],
      overTime: ((r?.over_time ?? []) as { week: string; count: number }[]) ?? [],
    };
  }, { byStatus: [], overTime: [] });
}

/**
 * The admin dashboard's charts, in one round trip.
 *
 *   weeks   the last 12 calendar weeks (Monday start), oldest first, with new
 *           client sign-ups and submitted application forms per week. Weeks
 *           with nothing in them are present as zeros (generate_series), so the
 *           line never skips a gap and silently implies continuity.
 *   cases   open-and-closed case counts by status, every status present.
 */
export type PeriodMetric = "clients" | "applications" | "enquiries" | "fees" | "documents" | "cases";

/**
 * The admin dashboard's reporting data for one period and the one before it.
 *
 * ONE statement, for the same reason as getAdminOverview: on the pooler,
 * concurrent reads starve rather than queue. `step` is the chart bucket,
 * counted from the period's own start (a "week" is seven days from `from`,
 * not a calendar week), so the first and last buckets are never partial.
 */
export async function getDashboardCharts(range: {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  bucket: "day" | "week";
}): Promise<{
  series: { day: string; signups: number; submitted: number }[];
  kpis: Record<PeriodMetric, { cur: number; prev: number }>;
  cases: { status: string; count: number }[];
}> {
  const empty = { cur: 0, prev: 0 };
  const fallback = {
    series: [],
    kpis: { clients: empty, applications: empty, enquiries: empty, fees: empty, documents: empty, cases: empty },
    cases: [],
  };
  const f = range.from.toISOString();
  const t = range.to.toISOString();
  const pf = range.prevFrom.toISOString();
  const pt = range.prevTo.toISOString();
  const step = range.bucket === "week" ? "7 days" : "1 day";
  return safeQuery(async () => {
    const [r] = await db()`
      WITH p AS (
        SELECT ${f}::timestamptz AS f, ${t}::timestamptz AS t,
               ${pf}::timestamptz AS pf, ${pt}::timestamptz AS pt
      )
      SELECT
        COALESCE((
          SELECT json_agg(x ORDER BY x.day) FROM (
            SELECT to_char(b AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              (SELECT count(*)::int FROM users u
                WHERE u.role IN ('student','professional','business')
                  AND u.created_at >= b AND u.created_at < LEAST(b + ${step}::interval, p.t)) AS signups,
              (SELECT count(*)::int FROM intake_forms i
                WHERE i.submitted_at >= b AND i.submitted_at < LEAST(b + ${step}::interval, p.t)) AS submitted
            FROM p, generate_series(p.f, p.t - interval '1 second', ${step}::interval) AS b
          ) x
        ), '[]'::json) AS series,
        json_build_object(
          'clients', (SELECT json_build_object(
              'cur', count(*) FILTER (WHERE u.created_at >= p.f AND u.created_at < p.t),
              'prev', count(*) FILTER (WHERE u.created_at >= p.pf AND u.created_at < p.pt))
            FROM users u, p WHERE u.role IN ('student','professional','business') AND u.created_at >= p.pf),
          'applications', (SELECT json_build_object(
              'cur', count(*) FILTER (WHERE i.submitted_at >= p.f AND i.submitted_at < p.t),
              'prev', count(*) FILTER (WHERE i.submitted_at >= p.pf AND i.submitted_at < p.pt))
            FROM intake_forms i, p WHERE i.submitted_at >= p.pf),
          'enquiries', (SELECT json_build_object(
              'cur', count(*) FILTER (WHERE e.created_at >= p.f AND e.created_at < p.t),
              'prev', count(*) FILTER (WHERE e.created_at >= p.pf AND e.created_at < p.pt))
            FROM enquiries e, p WHERE e.created_at >= p.pf),
          'fees', (SELECT json_build_object(
              'cur', count(*) FILTER (WHERE s.created_at >= p.f AND s.created_at < p.t),
              'prev', count(*) FILTER (WHERE s.created_at >= p.pf AND s.created_at < p.pt))
            FROM fee_submissions s, p WHERE s.created_at >= p.pf),
          'documents', (SELECT json_build_object(
              'cur', count(*) FILTER (WHERE d.created_at >= p.f AND d.created_at < p.t),
              'prev', count(*) FILTER (WHERE d.created_at >= p.pf AND d.created_at < p.pt))
            FROM documents d, p WHERE d.storage_key IS NOT NULL AND d.created_at >= p.pf),
          'cases', (SELECT json_build_object(
              'cur', count(*) FILTER (WHERE c.created_at >= p.f AND c.created_at < p.t),
              'prev', count(*) FILTER (WHERE c.created_at >= p.pf AND c.created_at < p.pt))
            FROM cases c, p WHERE c.created_at >= p.pf)
        ) AS kpis,
        COALESCE((
          SELECT json_agg(x) FROM (
            SELECT s::text AS status,
              (SELECT count(*)::int FROM cases c WHERE c.status = s) AS count
            FROM unnest(enum_range(NULL::case_status)) AS s
          ) x
        ), '[]'::json) AS cases
    `;
    return {
      series: (r?.series ?? []) as { day: string; signups: number; submitted: number }[],
      kpis: (r?.kpis ?? fallback.kpis) as Record<PeriodMetric, { cur: number; prev: number }>,
      cases: (r?.cases ?? []) as { status: string; count: number }[],
    };
  }, fallback);
}

/**
 * The consultant dashboard's data: each of THIS advisor's clients with the
 * stage they are at. Scope is exactly getAssignedClients' (assigned, or on a
 * case the advisor holds), so the two can never disagree.
 *
 * The stage is computed with the same rules as lib/portal/stage.ts
 * (studentStage), in one statement for all clients rather than one query
 * each. Keep the two in step: if a rule changes there, change it here.
 */
export async function getAdvisorBoard(advisorId: string): Promise<
  { id: string; name: string; role: string; stage: string; created_at: string; avatar_v: number | null }[]
> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT u.id, u.name, u.role::text AS role, u.created_at,
        CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::int END AS avatar_v,
        CASE
          WHEN u.role <> 'student' THEN 'other'
          WHEN f.live IS NULL AND f.rejected > 0 THEN 'fee_rejected'
          WHEN f.live IS NULL THEN 'fee_due'
          WHEN f.live = 'submitted' THEN 'fee_review'
          WHEN i.status IS NULL OR i.status IN ('draft', 'returned') THEN 'application'
          WHEN k.n = 0 THEN 'consent_due'
          ELSE 'complete'
        END AS stage
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          (SELECT status::text FROM fee_submissions
            WHERE user_id = u.id AND status IN ('submitted','verified') LIMIT 1) AS live,
          (SELECT count(*)::int FROM fee_submissions
            WHERE user_id = u.id AND status = 'rejected') AS rejected
      ) f ON TRUE
      LEFT JOIN LATERAL (
        SELECT status::text AS status FROM intake_forms
        WHERE user_id = u.id AND pathway = 'study' LIMIT 1
      ) i ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS n FROM consents
        WHERE user_id = u.id AND kind = 'student_undertaking'
      ) k ON TRUE
      WHERE EXISTS (
              SELECT 1 FROM staff_assignments sa
              WHERE sa.advisor_id = ${advisorId} AND sa.client_id = u.id
            )
         OR EXISTS (
              SELECT 1 FROM cases mine
              WHERE mine.advisor_id = ${advisorId} AND mine.client_id = u.id
            )
      ORDER BY u.name
    `;
    return rows as unknown as { id: string; name: string; role: string; stage: string; created_at: string; avatar_v: number | null }[];
  }, []);
}

export async function getAdminOverview(limitCases = 12, limitDocs = 10, limitUsers = 8) {
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        json_build_object(
          'totalUsers',       (SELECT count(*)::int FROM users),
          'students',         (SELECT count(*)::int FROM users WHERE role='student'),
          'professionals',    (SELECT count(*)::int FROM users WHERE role='professional'),
          'businesses',       (SELECT count(*)::int FROM users WHERE role='business'),
          'advisors',         (SELECT count(*)::int FROM users WHERE role IN ('advisor','admin','super_admin')),
          'openCases',        (SELECT count(*)::int FROM cases WHERE status NOT IN ('completed','closed')),
          'completedCases',   (SELECT count(*)::int FROM cases WHERE status IN ('completed','closed')),
          'pendingDocuments', (SELECT count(*)::int FROM documents WHERE status IN ('uploaded','pending_review')),
          'applications',     (SELECT count(*)::int FROM applications),
          'appointments',     (SELECT count(*)::int FROM appointments WHERE status IN ('requested','confirmed')),
          'unreadMessages',   (SELECT count(*)::int FROM messages WHERE read_at IS NULL),
          'totalQueries',     (SELECT count(*)::int FROM intake_forms WHERE status <> 'draft'),
          'newQueries',       (SELECT count(*)::int FROM intake_forms WHERE status = 'submitted'),
          'studentQueries',   (SELECT count(*)::int FROM intake_forms WHERE status <> 'draft' AND pathway = 'study'),
          'careerQueries',    (SELECT count(*)::int FROM intake_forms WHERE status <> 'draft' AND pathway = 'career'),
          'businessQueries',  (SELECT count(*)::int FROM intake_forms WHERE status <> 'draft' AND pathway = 'business'),
          -- Public contact-form enquiries. Folded into the same statement
          -- because this page must stay one round trip.
          'newEnquiries',     (SELECT count(*)::int FROM enquiries WHERE handled_at IS NULL),
          'undeliveredEnquiries', (SELECT count(*)::int FROM enquiries WHERE delivered = FALSE)
        ) AS metrics,

        COALESCE((
          SELECT json_agg(x) FROM (
            SELECT c.id, c.title, c.status, c.pathway, c.country, c.updated_at,
                   u.name AS client_name, a.name AS advisor_name
            FROM cases c
            JOIN users u ON u.id = c.client_id
            LEFT JOIN users a ON a.id = c.advisor_id
            ORDER BY c.updated_at DESC LIMIT ${limitCases}
          ) x
        ), '[]'::json) AS cases,

        COALESCE((
          SELECT json_agg(x) FROM (
            SELECT d.id, d.name, d.category, d.status, d.updated_at, u.name AS owner_name
            FROM documents d
            JOIN users u ON u.id = d.owner_id
            WHERE d.status IN ('uploaded','pending_review')
            ORDER BY d.updated_at DESC LIMIT ${limitDocs}
          ) x
        ), '[]'::json) AS pending_documents,

        COALESCE((
          SELECT json_agg(x) FROM (
            SELECT id, email, name, role, status, created_at, last_login_at
            FROM users ORDER BY created_at DESC LIMIT ${limitUsers}
          ) x
        ), '[]'::json) AS recent_users
    `;

    return {
      metrics: (r?.metrics ?? {}) as Record<string, number>,
      cases: ((r?.cases ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c.id),
        title: String(c.title),
        status: String(c.status),
        pathway: String(c.pathway),
        country: c.country ? String(c.country) : null,
        clientName: String(c.client_name),
        advisorName: c.advisor_name ? String(c.advisor_name) : null,
        updatedAt: iso(c.updated_at)!,
      })),
      pendingDocuments: ((r?.pending_documents ?? []) as Record<string, unknown>[]).map((d) => ({
        id: String(d.id),
        name: String(d.name),
        category: String(d.category),
        status: String(d.status),
        ownerName: String(d.owner_name),
        updatedAt: iso(d.updated_at)!,
      })),
      recentUsers: ((r?.recent_users ?? []) as Record<string, unknown>[]).map((u) => ({
        id: String(u.id),
        email: String(u.email),
        name: String(u.name),
        role: u.role as Role,
        status: String(u.status),
        createdAt: iso(u.created_at)!,
        lastLoginAt: iso(u.last_login_at),
      })),
    };
  }, {
    metrics: {} as Record<string, number>,
    cases: [] as { id: string; title: string; status: string; pathway: string; country: string | null; clientName: string; advisorName: string | null; updatedAt: string }[],
    pendingDocuments: [] as { id: string; name: string; category: string; status: string; ownerName: string; updatedAt: string }[],
    recentUsers: [] as { id: string; email: string; name: string; role: Role; status: string; createdAt: string; lastLoginAt: string | null }[],
  });
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        (SELECT count(*)::int FROM users) AS total_users,
        (SELECT count(*)::int FROM users WHERE role='student') AS students,
        (SELECT count(*)::int FROM users WHERE role='professional') AS professionals,
        (SELECT count(*)::int FROM users WHERE role='business') AS businesses,
        (SELECT count(*)::int FROM users WHERE role IN ('advisor','admin','super_admin')) AS advisors,
        (SELECT count(*)::int FROM users WHERE role='advisor') AS consultants,
        (SELECT count(*)::int FROM cases WHERE status NOT IN ('completed','closed')) AS open_cases,
        (SELECT count(*)::int FROM documents WHERE status IN ('uploaded','pending_review')) AS pending_documents,
        (SELECT count(*)::int FROM applications) AS applications,
        (SELECT count(*)::int FROM appointments WHERE status IN ('requested','confirmed')) AS appointments,
        (SELECT count(*)::int FROM messages WHERE read_at IS NULL) AS unread_messages
    `;
    return {
      totalUsers: Number(r.total_users),
      students: Number(r.students),
      professionals: Number(r.professionals),
      businesses: Number(r.businesses),
      advisors: Number(r.advisors),
      consultants: Number(r.consultants),
      openCases: Number(r.open_cases),
      pendingDocuments: Number(r.pending_documents),
      applications: Number(r.applications),
      appointments: Number(r.appointments),
      unreadMessages: Number(r.unread_messages),
    };
  }, {
    totalUsers: 0, students: 0, professionals: 0, businesses: 0, advisors: 0,
    consultants: 0, openCases: 0, pendingDocuments: 0, applications: 0,
    appointments: 0, unreadMessages: 0,
  });
}

/* -------------------------------------------------------------- broadcast */

export const BROADCAST_SUBJECT = "Message from SnZ Ventures";

/**
 * ONE MESSAGE TO MANY PEOPLE, into each person's own chat.
 *
 * Every recipient gets the message in a conversation of their own titled
 * "Message from SnZ Ventures" (made the first time, reused after), so a reply
 * is private to them and lands with the team like any other message. Staff
 * recipients see it because their own conversations now show in Messages.
 *
 * Four statements whatever the number of people: make the missing
 * conversations, add the message to each, stamp them, notify everyone.
 */
export async function broadcastMessage(senderId: string, userIds: string[], body: string): Promise<number> {
  return (await broadcastMessageTo(senderId, userIds, body)).length;
}

/** As broadcastMessage, returning the conversations written to. */
export async function broadcastMessageTo(senderId: string, userIds: string[], body: string): Promise<string[]> {
  const ids = [...new Set(userIds)].filter((id) => id !== senderId);
  if (!ids.length) return [];
  return safeQuery(async () => {
    return db().begin(async (tx) => {
      await tx`
        INSERT INTO conversations (client_id, subject)
        SELECT t.uid, ${BROADCAST_SUBJECT}
          FROM unnest(${ids}::uuid[]) AS t(uid)
         WHERE NOT EXISTS (
           SELECT 1 FROM conversations c WHERE c.client_id = t.uid AND c.subject = ${BROADCAST_SUBJECT}
         )
      `;
      const convs = await tx`
        SELECT DISTINCT ON (client_id) id, client_id FROM conversations
         WHERE client_id = ANY(${ids}::uuid[]) AND subject = ${BROADCAST_SUBJECT}
         ORDER BY client_id, created_at
      `;
      const convIds = convs.map((c) => String(c.id));
      await tx`
        INSERT INTO messages (conversation_id, author_id, body)
        SELECT cid, ${senderId}, ${body} FROM unnest(${convIds}::uuid[]) AS t(cid)
      `;
      await tx`
        UPDATE conversations SET updated_at = now(), last_sender_id = ${senderId}
         WHERE id = ANY(${convIds}::uuid[])
      `;
      await tx`
        INSERT INTO notifications (user_id, title, body, href, kind)
        SELECT client_id, ${BROADCAST_SUBJECT}, ${body.slice(0, 200)}, '/portal/messages/' || id::text, 'message'
          FROM conversations WHERE id = ANY(${convIds}::uuid[])
      `;
      return convIds;
    });
  }, [] as string[]);
}

/** Who a thread is with and what it is about, for the thread's heading. */
export async function conversationHeader(
  conversationId: string
): Promise<{ subject: string; ownerId: string; name: string; email: string; role: string; avatarV: number | null } | null> {
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT c.subject, u.id, u.name, u.email, u.role::text AS role,
             CASE WHEN u.avatar_url IS NULL THEN NULL ELSE floor(extract(epoch FROM u.updated_at))::int END AS avatar_v
        FROM conversations c JOIN users u ON u.id = c.client_id
       WHERE c.id = ${conversationId}
    `;
    return r
      ? {
          subject: String(r.subject),
          ownerId: String(r.id),
          name: String(r.name),
          email: String(r.email),
          role: String(r.role),
          avatarV: r.avatar_v == null ? null : Number(r.avatar_v),
        }
      : null;
  }, null);
}

import { db, safeQuery } from "../client";

/**
 * OPERATIONS REPOSITORY (migration 003)
 * ---------------------------------------------------------------------------
 * Status history, staff-only notes, and the multi-step intake forms.
 *
 * Same rule as lib/db/repos/portal.ts: SCOPE IN SQL, never in the component.
 * Two boundaries in this file are load-bearing and must not be relaxed:
 *
 *   1. `admin_notes` has NO client-facing read function. Not a filtered one —
 *      none at all. If a client-visible surface cannot call it, it cannot leak
 *      from one.
 *
 *   2. `status_history` reads split into two functions rather than one with a
 *      boolean. `getClientHistory` hardcodes `internal = FALSE` in the query
 *      text, so the caller cannot pass a flag that accidentally reveals an
 *      internal transition.
 */

/* ------------------------------------------------------------------ types */

export type HistoryEntry = {
  id: string;
  entity: "case" | "application" | "document";
  entityId: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  /**
   * TRUE for entries withheld from the client. Always FALSE on anything
   * `getClientHistory` returns — that query filters it in SQL — so a staff
   * view can label it without any risk of the flag reaching a client surface.
   */
  internal: boolean;
  actorName: string | null;
  createdAt: string;
};

export type AdminNote = {
  id: string;
  body: string;
  authorName: string | null;
  caseId: string | null;
  createdAt: string;
};

export type IntakeForm = {
  id: string;
  userId: string;
  pathway: "study" | "career" | "business";
  status: "draft" | "submitted" | "under_review" | "accepted" | "returned";
  step: number;
  data: Record<string, unknown>;
  submittedAt: string | null;
  updatedAt: string;
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/* -------------------------------------------------------- status history */

/**
 * Record a transition. Called from the same place that performs the update, so
 * the trail cannot drift from the actual status.
 *
 * `internal: true` keeps the entry off every client surface — use it for
 * transitions that are real but not the client's business.
 */
export async function recordStatus(input: {
  entity: HistoryEntry["entity"];
  entityId: string;
  subjectId: string | null;
  fromStatus?: string | null;
  toStatus: string;
  note?: string | null;
  internal?: boolean;
  actorId?: string | null;
}): Promise<void> {
  await safeQuery(async () => {
    await db()`
      INSERT INTO status_history
        (entity, entity_id, subject_id, from_status, to_status, note, internal, actor_id)
      VALUES (
        ${input.entity}, ${input.entityId}, ${input.subjectId},
        ${input.fromStatus ?? null}, ${input.toStatus}, ${input.note ?? null},
        ${input.internal ?? false}, ${input.actorId ?? null}
      )
    `;
    return null;
  }, null);
}

const mapHistory = (r: Record<string, unknown>): HistoryEntry => ({
  id: String(r.id),
  entity: r.entity as HistoryEntry["entity"],
  entityId: r.entity_id as string,
  fromStatus: (r.from_status as string) ?? null,
  toStatus: r.to_status as string,
  note: (r.note as string) ?? null,
  internal: Boolean(r.internal),
  actorName: (r.actor_name as string) ?? null,
  createdAt: iso(r.created_at)!,
});

/**
 * The client's own journey.
 *
 * `subject_id = viewer` scopes it to them, and `internal = FALSE` is written
 * into the query rather than accepted as an argument — see the header note.
 */
export async function getClientHistory(
  viewerId: string,
  limit = 60
): Promise<HistoryEntry[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT h.*, u.name AS actor_name
      FROM status_history h
      LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.subject_id = ${viewerId} AND h.internal = FALSE
      ORDER BY h.created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(mapHistory);
  }, []);
}

/** Staff view of one entity's trail — internal entries included. */
export async function getEntityHistory(
  entity: HistoryEntry["entity"],
  entityId: string
): Promise<HistoryEntry[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT h.*, u.name AS actor_name
      FROM status_history h
      LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.entity = ${entity} AND h.entity_id = ${entityId}
      ORDER BY h.created_at DESC
    `;
    return rows.map(mapHistory);
  }, []);
}

/** Staff view of everything recorded about one client. */
export async function getSubjectHistory(
  subjectId: string,
  limit = 100
): Promise<HistoryEntry[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT h.*, u.name AS actor_name
      FROM status_history h
      LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.subject_id = ${subjectId}
      ORDER BY h.created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(mapHistory);
  }, []);
}

/* ------------------------------------------------------------ admin notes */
/* STAFF ONLY. There is deliberately no client-scoped reader in this section. */

export async function addAdminNote(input: {
  subjectId: string;
  caseId?: string | null;
  authorId: string;
  body: string;
}): Promise<AdminNote | null> {
  return safeQuery(async () => {
    const [row] = await db()`
      INSERT INTO admin_notes (subject_id, case_id, author_id, body)
      VALUES (${input.subjectId}, ${input.caseId ?? null}, ${input.authorId}, ${input.body})
      RETURNING id, body, case_id, created_at
    `;
    return row
      ? {
          id: row.id as string,
          body: row.body as string,
          caseId: (row.case_id as string) ?? null,
          authorName: null,
          createdAt: iso(row.created_at)!,
        }
      : null;
  }, null);
}

export async function getAdminNotes(subjectId: string): Promise<AdminNote[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT n.id, n.body, n.case_id, n.created_at, u.name AS author_name
      FROM admin_notes n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.subject_id = ${subjectId}
      ORDER BY n.created_at DESC
    `;
    return rows.map((r) => ({
      id: r.id as string,
      body: r.body as string,
      caseId: (r.case_id as string) ?? null,
      authorName: (r.author_name as string) ?? null,
      createdAt: iso(r.created_at)!,
    }));
  }, []);
}

export async function deleteAdminNote(id: string, authorId: string): Promise<boolean> {
  return safeQuery(async () => {
    // Scoped to the author: a note is one person's record of a call, and
    // letting any staff member delete another's would make the trail unusable.
    const rows = await db()`
      DELETE FROM admin_notes WHERE id = ${id} AND author_id = ${authorId} RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

/**
 * THE WHOLE CLIENT FILE IN ONE STATEMENT — STAFF ONLY.
 *
 * Named `getAdminUserFile`, not `getClientFile`. That is not cosmetic: this
 * returns `admin_notes`, which must never reach a client surface, and the
 * authorization audit rejects any admin_notes reader whose name reads as
 * client-scoped. It caught the earlier name, correctly — a function that
 * sounds like it serves the client is one somebody will eventually call from a
 * client page.
 *
 * The admin user page issued six reads through Promise.all — profile,
 * documents, cases, intake, history, notes — on top of the user lookup and the
 * layout's badges. Eight round trips on a single connection to a database in
 * another region is a 504, and this page had never been opened by the test
 * suite, so it had never shown it.
 *
 * Each part is bounded, so a client with a thousand documents still returns a
 * page rather than a timeout.
 */
export async function getAdminUserFile(
  userId: string,
  pathway: "study" | "career" | "business" | null
): Promise<{
  documents: { id: string; name: string; category: string; status: string; reviewNote: string | null; updatedAt: string }[];
  cases: { id: string; title: string; status: string; pathway: string; country: string | null; reference: string | null; advisorName: string | null; updatedAt: string }[];
  intake: IntakeForm | null;
  history: HistoryEntry[];
  notes: AdminNote[];
  consents: { id: string; kind: string; version: string; signedName: string; acceptedAt: string }[];
}> {
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT
        COALESCE((SELECT json_agg(x) FROM (
          SELECT d.id, d.name, d.category, d.status, d.review_note, d.updated_at
          FROM documents d WHERE d.owner_id = ${userId}
          ORDER BY d.updated_at DESC LIMIT 50
        ) x), '[]'::json) AS documents,

        COALESCE((SELECT json_agg(x) FROM (
          SELECT c.id, c.title, c.status, c.pathway, c.country, c.reference,
                 c.updated_at, a.name AS advisor_name
          FROM cases c LEFT JOIN users a ON a.id = c.advisor_id
          WHERE c.client_id = ${userId}
          ORDER BY c.updated_at DESC LIMIT 50
        ) x), '[]'::json) AS cases,

        (SELECT row_to_json(f) FROM (
          SELECT * FROM intake_forms
          WHERE user_id = ${userId} AND pathway = ${pathway}
        ) f) AS intake,

        COALESCE((SELECT json_agg(x) FROM (
          SELECT h.id, h.entity, h.entity_id, h.from_status, h.to_status,
                 h.note, h.internal, h.created_at, u.name AS actor_name
          FROM status_history h LEFT JOIN users u ON u.id = h.actor_id
          WHERE h.subject_id = ${userId}
          ORDER BY h.created_at DESC LIMIT 40
        ) x), '[]'::json) AS history,

        COALESCE((SELECT json_agg(x) FROM (
          SELECT n.id, n.body, n.case_id, n.created_at, u.name AS author_name
          FROM admin_notes n LEFT JOIN users u ON u.id = n.author_id
          WHERE n.subject_id = ${userId}
          ORDER BY n.created_at DESC LIMIT 50
        ) x), '[]'::json) AS notes,

        -- Folded into the SAME statement rather than fetched separately: this
        -- page is already one round trip and must stay that way. A consent
        -- nobody can see is a record that exists and does no work.
        COALESCE((SELECT json_agg(x) FROM (
          SELECT c.id, c.kind, c.version, c.signed_name, c.accepted_at
          FROM consents c
          WHERE c.user_id = ${userId}
          ORDER BY c.accepted_at DESC
        ) x), '[]'::json) AS consents
    `;

    return {
      documents: ((r?.documents ?? []) as Record<string, unknown>[]).map((d) => ({
        id: String(d.id),
        name: String(d.name),
        category: String(d.category),
        status: String(d.status),
        reviewNote: d.review_note ? String(d.review_note) : null,
        updatedAt: iso(d.updated_at)!,
      })),
      cases: ((r?.cases ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c.id),
        title: String(c.title),
        status: String(c.status),
        pathway: String(c.pathway),
        country: c.country ? String(c.country) : null,
        reference: c.reference ? String(c.reference) : null,
        advisorName: c.advisor_name ? String(c.advisor_name) : null,
        updatedAt: iso(c.updated_at)!,
      })),
      intake: r?.intake ? mapIntake(r.intake as Record<string, unknown>) : null,
      history: ((r?.history ?? []) as Record<string, unknown>[]).map(mapHistory),
      consents: ((r?.consents ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c.id),
        kind: String(c.kind),
        version: String(c.version),
        signedName: String(c.signed_name),
        acceptedAt: iso(c.accepted_at)!,
      })),
      notes: ((r?.notes ?? []) as Record<string, unknown>[]).map((n) => ({
        id: n.id as string,
        body: n.body as string,
        caseId: (n.case_id as string) ?? null,
        authorName: (n.author_name as string) ?? null,
        createdAt: iso(n.created_at)!,
      })),
    };
  }, { documents: [], cases: [], intake: null, history: [], notes: [], consents: [] });
}

/* ----------------------------------------------------------- intake forms */

const mapIntake = (r: Record<string, unknown>): IntakeForm => ({
  id: r.id as string,
  userId: r.user_id as string,
  pathway: r.pathway as IntakeForm["pathway"],
  status: r.status as IntakeForm["status"],
  step: Number(r.step ?? 0),
  data: (r.data as Record<string, unknown>) ?? {},
  submittedAt: iso(r.submitted_at),
  updatedAt: iso(r.updated_at)!,
});

export async function getIntake(
  userId: string,
  pathway: IntakeForm["pathway"]
): Promise<IntakeForm | null> {
  return safeQuery(async () => {
    const [row] = await db()`
      SELECT * FROM intake_forms
      WHERE user_id = ${userId} AND pathway = ${pathway}
    `;
    return row ? mapIntake(row) : null;
  }, null);
}

/**
 * Save & continue.
 *
 * The JSONB is MERGED (`data || excluded.data`), not replaced, so a step that
 * posts only its own fields cannot wipe the eight steps either side of it.
 *
 * `step` takes the higher of old and new so that going back to edit step 2
 * does not reset the resume point to 2 and hide steps 3–9.
 *
 * A submitted form stops accepting draft writes — the guard is in the WHERE
 * clause, not in the caller.
 */
export async function saveIntakeDraft(input: {
  userId: string;
  pathway: IntakeForm["pathway"];
  step: number;
  data: Record<string, unknown>;
}): Promise<IntakeForm | null> {
  return safeQuery(async () => {
    const [row] = await db()`
      INSERT INTO intake_forms (user_id, pathway, step, data)
      VALUES (${input.userId}, ${input.pathway}, ${input.step}, ${db().json(input.data as never)})
      ON CONFLICT (user_id, pathway) DO UPDATE
        SET data       = intake_forms.data || EXCLUDED.data,
            step       = GREATEST(intake_forms.step, EXCLUDED.step),
            updated_at = now()
        WHERE intake_forms.status = 'draft'
      RETURNING *
    `;
    return row ? mapIntake(row) : null;
  }, null);
}

/** Final submit. Same draft-only guard, so a form cannot be submitted twice. */
/**
 * Marks the form submitted AND opens the case it belongs to.
 *
 * WHY A CASE IS CREATED HERE
 * Submitting used to write one intake_forms row and stop. Staff saw it under
 * Requests, but no case existed — so the answers someone gave, the documents
 * they uploaded and the undertaking they signed were three unrelated records on
 * three screens, and "open this applicant's file" was not something anyone
 * could do. `intake_forms.case_id` had been in the schema since 003 and was
 * never once populated.
 *
 * TWO ROUND TRIPS, NOT THREE. The insert and the back-reference are one
 * statement via a CTE, which is safe because they touch different tables.
 * Folding the first UPDATE in as well is not: Postgres does not define what
 * happens when one statement modifies the same row twice, and intake_forms
 * would be written by both the submit and the link.
 *
 * The case is deliberately NOT created when the update matches nothing — a
 * second submit of an already-submitted form must not open a second case.
 */
export async function submitIntake(input: {
  userId: string;
  pathway: IntakeForm["pathway"];
  data: Record<string, unknown>;
  title: string;
  country?: string | null;
}): Promise<IntakeForm | null> {
  return safeQuery(async () => {
    const [row] = await db()`
      UPDATE intake_forms
         SET data         = intake_forms.data || ${db().json(input.data as never)},
             status       = 'submitted',
             submitted_at = now(),
             updated_at   = now()
       WHERE user_id = ${input.userId}
         AND pathway = ${input.pathway}
         AND status  = 'draft'
      RETURNING *
    `;
    if (!row) return null;

    const [linked] = await db()`
      WITH opened AS (
        INSERT INTO cases (client_id, pathway, title, country, status, next_action)
        VALUES (
          ${input.userId},
          ${input.pathway},
          ${input.title.slice(0, 160)},
          ${input.country ?? null},
          'new',
          'Review the submitted application'
        )
        RETURNING id
      )
      UPDATE intake_forms
         SET case_id    = (SELECT id FROM opened),
             updated_at = now()
       WHERE id = ${row.id}
      RETURNING *
    `;

    // If the link failed for any reason the form IS still submitted, which is
    // the part that matters to the applicant. Returning the earlier row keeps
    // that true rather than reporting a failure that did not happen.
    return mapIntake(linked ?? row);
  }, null);
}

/** Staff: move a submitted intake on, or send it back for changes. */
export async function setIntakeStatus(
  id: string,
  status: IntakeForm["status"]
): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE intake_forms SET status = ${status}::intake_status, updated_at = now()
      WHERE id = ${id} RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

export async function getIntakeById(id: string): Promise<IntakeForm | null> {
  return safeQuery(async () => {
    const [row] = await db()`SELECT * FROM intake_forms WHERE id = ${id}`;
    return row ? mapIntake(row) : null;
  }, null);
}

/** Staff queue — submitted intakes waiting to be read, oldest first. */
export async function getIntakeQueue(limit = 100) {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT f.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM intake_forms f
      JOIN users u ON u.id = f.user_id
      WHERE f.status <> 'draft'
      ORDER BY f.submitted_at ASC NULLS LAST
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      ...mapIntake(r),
      userName: r.user_name as string,
      userEmail: r.user_email as string,
      userRole: r.user_role as string,
    }));
  }, []);
}

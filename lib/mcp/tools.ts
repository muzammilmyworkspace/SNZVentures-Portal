import "server-only";
import { db, safeQuery } from "@/lib/db/client";
import * as ops from "@/lib/db/repos/operations";
import * as portal from "@/lib/db/repos/portal";
import * as feeRepo from "@/lib/db/repos/fees";
import * as profileRepo from "@/lib/db/repos/profiles";
import * as checklistRepo from "@/lib/db/repos/checklist";
import * as userRepo from "@/lib/db/repos/users";
import { CLIENT_ROLES } from "@/lib/auth/types";
import { FLAT_FIELDS, FIELD_BY_KEY, pick, labelled } from "./fields";
import type { Tool } from "./protocol";

/**
 * WHAT CLAUDE IS ALLOWED TO ASK THIS PORTAL.
 * ---------------------------------------------------------------------------
 * Seven tools, every one of them a read. There is no write path in this file
 * and no import that could become one — not "we chose not to expose writes",
 * but nothing to expose. That matters more here than anywhere else in the app,
 * because everything these tools return is text a client typed into a form,
 * and text a client typed is text that can try to give instructions. Read-only
 * makes the worst case a wrong answer instead of a wrong action.
 *
 * The tools are shaped around the work they replace, which was opening the
 * admin area and copying by hand. That is why `export_application_fields`
 * exists as a bulk tool rather than leaving the model to call `client_file`
 * forty times: forty students' passport numbers is ONE question, and it should
 * be one round trip, not forty.
 */

const CLIENT_ROLE_LIST = CLIENT_ROLES as unknown as string[];

/* ------------------------------------------------------------------ tools */

const limitProp = (max: number, fallback: number) => ({
  type: "integer" as const,
  description: `How many rows to return at most. Default ${fallback}, maximum ${max}.`,
  minimum: 1,
  maximum: max,
});

const clamp = (v: unknown, fallback: number, max: number) =>
  typeof v === "number" ? Math.min(Math.max(Math.trunc(v), 1), max) : fallback;

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const listApplicationFields: Tool = {
  name: "list_application_fields",
  title: "List application questions",
  description:
    "Every question on the student application, with the key its answer is stored under, " +
    "its label, and which section it belongs to. Call this before export_application_fields " +
    "so you can name fields exactly. Keys containing a dot (e.g. edu.eduSchool) repeat — a " +
    "student has several qualifications and several jobs, so those return a list per student.",
  properties: {
    search: {
      type: "string",
      description:
        "Optional. Only return questions whose label or key contains this, e.g. \"passport\".",
    },
  },
  async run(args) {
    const search = str(args.search)?.toLowerCase();
    const rows = search
      ? FLAT_FIELDS.filter(
          (f) => f.label.toLowerCase().includes(search) || f.key.toLowerCase().includes(search)
        )
      : FLAT_FIELDS;
    return { count: rows.length, fields: rows };
  },
};

const findClients: Tool = {
  name: "find_clients",
  title: "Find clients",
  description:
    "Search clients and see where each one stands: their application status, their latest fee " +
    "submission, how many documents they have sent, how many are still waiting for review, and " +
    "who their advisor is. Use this to answer 'who has not done X yet' questions, and to get " +
    "the client id you need for client_file.",
  properties: {
    query: { type: "string", description: "Optional. Matches part of a name or email address." },
    status: {
      type: "string",
      description: "Optional. Filter by account status.",
      enum: ["active", "suspended", "pending"],
    },
    awaitingReview: {
      type: "boolean",
      description: "Optional. When true, only clients with at least one document awaiting review.",
    },
    limit: limitProp(200, 50),
  },
  async run(args) {
    const q = str(args.query);
    const like = q ? `%${q}%` : null;
    const status = str(args.status);
    const awaiting = args.awaitingReview === true;
    const limit = clamp(args.limit, 50, 200);

    return safeQuery(async () => {
      /*
        Scalar sub-selects rather than joins, on purpose. A client can hold
        several intake rows and several fee submissions; joining them would
        multiply the row and report one student three times with three
        different fee statuses. Each sub-select answers "the latest one",
        which is the question actually being asked.
      */
      const rows = await db()`
        SELECT u.id, u.name, u.email, u.role::text AS role, u.status::text AS status,
               u.created_at, u.last_login_at,
               (SELECT i.status::text FROM intake_forms i
                 WHERE i.user_id = u.id ORDER BY i.updated_at DESC LIMIT 1) AS application_status,
               (SELECT i.submitted_at FROM intake_forms i
                 WHERE i.user_id = u.id ORDER BY i.updated_at DESC LIMIT 1) AS application_submitted_at,
               (SELECT f.status::text FROM fee_submissions f
                 WHERE f.user_id = u.id AND f.status <> 'withdrawn'
                 ORDER BY f.created_at DESC LIMIT 1) AS fee_status,
               (SELECT count(*)::int FROM documents d WHERE d.owner_id = u.id) AS documents,
               (SELECT count(*)::int FROM documents d
                 WHERE d.owner_id = u.id AND d.status IN ('uploaded','pending_review'))
                 AS documents_awaiting_review,
               (SELECT a.name FROM staff_assignments sa
                  JOIN users a ON a.id = sa.advisor_id
                 WHERE sa.client_id = u.id ORDER BY sa.created_at DESC LIMIT 1) AS advisor
          FROM users u
         WHERE u.role::text = ANY(${CLIENT_ROLE_LIST}::text[])
           AND (${like}::text IS NULL OR u.name ILIKE ${like} OR u.email ILIKE ${like})
           AND (${status}::text IS NULL OR u.status::text = ${status})
           AND (${awaiting} = false OR EXISTS (
                 SELECT 1 FROM documents d
                  WHERE d.owner_id = u.id AND d.status IN ('uploaded','pending_review')))
         ORDER BY u.created_at DESC
         LIMIT ${limit}
      `;

      return {
        count: rows.length,
        note: rows.length === limit ? `Capped at ${limit}; there may be more.` : undefined,
        clients: rows.map((r) => ({
          clientId: String(r.id),
          name: String(r.name),
          email: String(r.email),
          role: String(r.role),
          accountStatus: String(r.status),
          application: r.application_status ? String(r.application_status) : "not started",
          applicationSubmittedAt: r.application_submitted_at
            ? new Date(r.application_submitted_at as string).toISOString()
            : null,
          fee: r.fee_status ? String(r.fee_status) : "none sent",
          documents: Number(r.documents ?? 0),
          documentsAwaitingReview: Number(r.documents_awaiting_review ?? 0),
          advisor: r.advisor ? String(r.advisor) : null,
          joined: new Date(r.created_at as string).toISOString(),
          lastLogin: r.last_login_at ? new Date(r.last_login_at as string).toISOString() : null,
        })),
      };
    }, { count: 0, note: undefined, clients: [] });
  },
};

const clientFile: Tool = {
  name: "client_file",
  title: "Open one client's file",
  description:
    "Everything held on one client: contact details, their full application with real question " +
    "labels, documents and their review status, every fee submission, cases, staff notes, " +
    "signed consents, status history and their Feb 2027 checklist ticks. Identify them by " +
    "clientId (from find_clients) or by email.",
  properties: {
    clientId: { type: "string", description: "The client's id, as returned by find_clients." },
    email: { type: "string", description: "The client's email address, if you do not have their id." },
  },
  async run(args) {
    const id = str(args.clientId);
    const email = str(args.email);
    // Thrown, not returned. dispatch turns a throw into isError:true, and a
    // failed lookup dressed up as a successful result is one the model reads
    // as "this client has no data" rather than "you asked the wrong way".
    if (!id && !email) throw new Error("Give either clientId or email.");

    const user = id ? await userRepo.findById(id) : await userRepo.findByEmail(email!);
    if (!user) throw new Error(`No client found for ${id ?? email}.`);

    const pathway =
      user.role === "student" ? "study" : user.role === "professional" ? "career" : "business";

    const [profile, file, feeHistory, ticks] = await Promise.all([
      profileRepo.getProfile(user.id, user.role),
      ops.getAdminUserFile(user.id, pathway as "study" | "career" | "business"),
      feeRepo.feeHistoryFor(user.id),
      checklistRepo.ticksFor(user.id),
    ]);

    return {
      client: {
        clientId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountStatus: user.status,
        emailVerified: user.emailVerified,
        joined: user.createdAt,
        lastLogin: user.lastLoginAt,
      },
      profile,
      application: file.intake
        ? {
            status: file.intake.status,
            submittedAt: file.intake.submittedAt,
            updatedAt: file.intake.updatedAt,
            // Labelled, not raw. `passportNo: "AB123"` is a key nobody asked
            // about; "Passport number" is the thing on the form.
            answers: labelled(file.intake.data),
          }
        : null,
      documents: file.documents,
      fees: feeHistory,
      cases: file.cases,
      notes: file.notes,
      consents: file.consents,
      history: file.history,
      checklistTicks: ticks,
    };
  },
};

const exportApplicationFields: Tool = {
  name: "export_application_fields",
  title: "Export chosen answers for many clients",
  description:
    "The bulk extract: name the application fields you want and get one row per client. This is " +
    "what to use for spreadsheet work — passport numbers and dates of birth for a visa batch, " +
    "every applicant's chosen university and intake, and so on. Get the exact field keys from " +
    "list_application_fields first. A dotted key returns a list per client, because those " +
    "answers repeat.",
  properties: {
    fields: {
      type: "array",
      items: { type: "string" },
      description:
        "Field keys from list_application_fields, e.g. [\"passportNo\", \"dob\", \"dest\"]. " +
        "Name and email are always included.",
    },
    query: { type: "string", description: "Optional. Only clients whose name or email matches." },
    submittedOnly: {
      type: "boolean",
      description:
        "Optional. When true, only applications that have actually been submitted rather than " +
        "still being drafted. Default false.",
    },
    limit: limitProp(300, 100),
  },
  required: ["fields"],
  async run(args) {
    const wanted = (args.fields as string[]).map((f) => f.trim()).filter(Boolean);
    if (!wanted.length) throw new Error("Name at least one field.");

    const unknown = wanted.filter((f) => !FIELD_BY_KEY.has(f));
    if (unknown.length) {
      throw new Error(
        `Not application fields: ${unknown.join(", ")}. ` +
          "Call list_application_fields to see the exact keys."
      );
    }

    const q = str(args.query);
    const like = q ? `%${q}%` : null;
    const submittedOnly = args.submittedOnly === true;
    const limit = clamp(args.limit, 100, 300);

    return safeQuery(async () => {
      const rows = await db()`
        SELECT u.id, u.name, u.email, i.status::text AS status, i.submitted_at, i.data
          FROM users u
          JOIN intake_forms i ON i.user_id = u.id
         WHERE u.role::text = ANY(${CLIENT_ROLE_LIST}::text[])
           AND (${like}::text IS NULL OR u.name ILIKE ${like} OR u.email ILIKE ${like})
           AND (${submittedOnly} = false OR i.submitted_at IS NOT NULL)
         ORDER BY u.name ASC
         LIMIT ${limit}
      `;

      const columns = wanted.map((key) => ({ key, label: FIELD_BY_KEY.get(key)!.label }));

      return {
        count: rows.length,
        note: rows.length === limit ? `Capped at ${limit}; there may be more.` : undefined,
        columns,
        rows: rows.map((r) => {
          const data = (r.data ?? {}) as Record<string, unknown>;
          const values: Record<string, unknown> = {};
          for (const { key, label } of columns) values[label] = pick(data, key);
          return {
            clientId: String(r.id),
            name: String(r.name),
            email: String(r.email),
            applicationStatus: String(r.status),
            submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
            ...values,
          };
        }),
      };
    }, { count: 0, note: undefined, columns: [], rows: [] });
  },
};

const feeSubmissions: Tool = {
  name: "fee_submissions",
  title: "List fee submissions",
  description:
    "Payment declarations students have sent, with the amount, university, method, transaction " +
    "reference, who paid if it was a third party, and the staff decision. Defaults to those " +
    "still awaiting verification.",
  properties: {
    status: {
      type: "string",
      description:
        "Which ones. \"submitted\" means still awaiting a decision; \"all\" returns every state.",
      enum: ["submitted", "verified", "rejected", "withdrawn", "all"],
    },
    limit: limitProp(200, 100),
  },
  async run(args) {
    const asked = str(args.status) ?? "submitted";
    const status = asked === "all" ? null : (asked as feeRepo.FeeStatus);
    const { rows, pending } = await feeRepo.listFeeSubmissions(status, clamp(args.limit, 100, 200));
    return { count: rows.length, awaitingVerification: pending, submissions: rows };
  },
};

const documentsAwaitingReview: Tool = {
  name: "documents_awaiting_review",
  title: "Documents waiting to be reviewed",
  description:
    "Every document sent by a client that nobody has approved or sent back yet, grouped by the " +
    "client who sent it. Use it to answer 'what is waiting on us'.",
  properties: { limit: limitProp(300, 100) },
  async run(args) {
    const docs = await portal.getDocumentsForReview(clamp(args.limit, 100, 300));

    // Grouped, because a flat list of ninety files tells you the size of the
    // queue and nothing about whose it is — which was the complaint that put
    // folders on the review page in the first place.
    const byClient = new Map<string, { client: string; clientId: string; documents: unknown[] }>();
    for (const d of docs) {
      const key = d.ownerId;
      if (!byClient.has(key)) {
        byClient.set(key, { client: d.ownerName ?? "Unknown", clientId: d.ownerId, documents: [] });
      }
      byClient.get(key)!.documents.push({
        id: d.id,
        name: d.name,
        category: d.category,
        status: d.status,
        sizeBytes: d.sizeBytes,
        mimeType: d.mimeType,
        updatedAt: d.updatedAt,
      });
    }

    return { totalDocuments: docs.length, clients: [...byClient.values()] };
  },
};

const portalOverview: Tool = {
  name: "portal_overview",
  title: "Portal overview",
  description:
    "Counts across the whole portal — clients, cases by status, documents awaiting review, fees " +
    "awaiting verification, applications submitted. Use it for a quick state of things.",
  properties: {},
  async run() {
    return portal.getAdminMetrics();
  },
};

export const TOOLS: Tool[] = [
  findClients,
  clientFile,
  listApplicationFields,
  exportApplicationFields,
  feeSubmissions,
  documentsAwaitingReview,
  portalOverview,
];

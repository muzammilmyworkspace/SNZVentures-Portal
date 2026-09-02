/**
 * Applies every migration to an in-memory Postgres (PGlite) and exercises the
 * representative queries the app runs, so SQL errors surface here rather than
 * against the production database.
 *
 *   npm run db:verify
 */
// Loads .env.local so `npm run db:*` works as the error messages promise.
import "./lib/env.mjs";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "lib", "db", "migrations");
const db = new PGlite();
let failures = 0;

const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok    ${label}`);
  } catch (error) {
    failures++;
    console.log(`  FAIL  ${label}\n        ${error.message?.split("\n")[0]}`);
  }
};

console.log("\nApplying migrations\n");
const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const body = await fs.readFile(path.join(DIR, f), "utf8");
  await check(f, () => db.exec(body));
}

console.log("\nSchema shape\n");

const EXPECTED = [
  "users", "user_tokens", "profiles", "student_profiles", "professional_profiles",
  "business_profiles", "staff_assignments", "cases", "opportunities",
  "applications", "documents", "tasks", "appointments", "conversations",
  "messages", "notifications", "audit_logs",
  // 003
  "status_history", "admin_notes", "intake_forms",
];

await check("all tables present", async () => {
  const res = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  );
  const have = new Set(res.rows.map((r) => r.table_name));
  const missing = EXPECTED.filter((t) => !have.has(t));
  if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
});

await check("foreign keys wired", async () => {
  const res = await db.query(
    `SELECT count(*)::int AS n FROM information_schema.table_constraints
     WHERE constraint_type='FOREIGN KEY' AND table_schema='public'`
  );
  if (res.rows[0].n < 15) throw new Error(`only ${res.rows[0].n} foreign keys`);
});

await check("indexes created", async () => {
  const res = await db.query(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'`
  );
  if (res.rows[0].n < 25) throw new Error(`only ${res.rows[0].n} indexes`);
});

await check("row level security enabled on every table", async () => {
  const res = await db.query(
    `SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = false`
  );
  const open = res.rows
    .map((r) => r.relname)
    .filter((t) => EXPECTED.includes(t));
  if (open.length) throw new Error(`RLS off: ${open.join(", ")}`);
});

await check("no permissive policy re-opens a table", async () => {
  // RLS with zero policies denies everything. A policy added later could undo
  // that, so the schema is expected to carry none at all.
  const res = await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public'`);
  if (res.rows[0].n !== 0) throw new Error(`${res.rows[0].n} policy(ies) present`);
});

console.log("\nConstraints\n");

await check("email uniqueness is case-insensitive", async () => {
  await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('Case@Test.io','A','student','x')`
  );
  try {
    await db.query(
      `INSERT INTO users (email,name,role,password_hash) VALUES ('case@test.io','B','student','y')`
    );
  } catch {
    return; // rejected as intended
  }
  throw new Error("duplicate email was accepted");
});

await check("role enum rejects invalid values", async () => {
  try {
    await db.query(
      `INSERT INTO users (email,name,role,password_hash) VALUES ('r@t.io','R','root','x')`
    );
  } catch {
    return;
  }
  throw new Error("invalid role accepted");
});

await check("cascade delete removes dependent rows", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('c@t.io','C','student','x') RETURNING id`
  );
  const id = u.rows[0].id;
  await db.query(`INSERT INTO profiles (user_id) VALUES ($1)`, [id]);
  await db.query(
    `INSERT INTO cases (client_id,pathway,title) VALUES ($1,'study','T')`, [id]
  );
  await db.query(`DELETE FROM users WHERE id=$1`, [id]);
  const left = await db.query(`SELECT count(*)::int AS n FROM cases WHERE client_id=$1`, [id]);
  if (left.rows[0].n !== 0) throw new Error("cases survived user deletion");
});

await check("staff assignment is unique per pair", async () => {
  const a = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('adv@t.io','Adv','advisor','x') RETURNING id`
  );
  const c = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('cli@t.io','Cli','student','x') RETURNING id`
  );
  await db.query(`INSERT INTO staff_assignments (client_id,advisor_id) VALUES ($1,$2)`, [
    c.rows[0].id, a.rows[0].id,
  ]);
  await db.query(
    `INSERT INTO staff_assignments (client_id,advisor_id) VALUES ($1,$2)
     ON CONFLICT (client_id, advisor_id) DO NOTHING`,
    [c.rows[0].id, a.rows[0].id]
  );
  const n = await db.query(`SELECT count(*)::int AS n FROM staff_assignments`);
  if (n.rows[0].n !== 1) throw new Error("duplicate assignment created");
});

console.log("\nStaff notifications\n");

/*
  THIS ONE FAILS SILENTLY IF IT IS WRONG.

  notifyStaff runs through safeQuery, which swallows the error and returns
  false — so a broken INSERT ... SELECT notifies nobody and logs nothing, and
  the first sign would be somebody asking why the bell never rings. It is
  exercised here against a real Postgres, with real rows, and the recipients
  are counted.
*/
{
  const ids = {
    superAdmin: "11111111-1111-1111-1111-111111111111",
    admin: "22222222-2222-2222-2222-222222222222",
    advisor: "33333333-3333-3333-3333-333333333333",
    otherAdvisor: "44444444-4444-4444-4444-444444444444",
    student: "55555555-5555-5555-5555-555555555555",
    suspendedAdmin: "66666666-6666-6666-6666-666666666666",
  };

  await check("fixtures", async () => {
    for (const [key, id] of Object.entries(ids)) {
      const role =
        key === "superAdmin" ? "super_admin"
        : key === "admin" || key === "suspendedAdmin" ? "admin"
        : key === "student" ? "student"
        : "advisor";
      await db.query(
        `INSERT INTO users (id, email, name, role, status, password_hash)
         VALUES ($1, $2, $3, $4, $5, 'x')`,
        [id, `${key}@test`, key, role, key === "suspendedAdmin" ? "suspended" : "active"]
      );
    }
    await db.query(
      `INSERT INTO staff_assignments (advisor_id, client_id) VALUES ($1, $2)`,
      [ids.advisor, ids.student]
    );
  });

  const notifyStaff = async (title, dedupeMins = null) =>
    db.query(
      `INSERT INTO notifications (user_id, title, body, href, kind)
       SELECT u.id, $1, NULL, '/x', 'general'
         FROM users u
        WHERE u.status = 'active'
          AND (
            u.role IN ('admin', 'super_admin')
            OR u.id IN (SELECT a.advisor_id FROM staff_assignments a WHERE a.client_id = $2)
          )
          AND u.id <> $3
          AND (
            $4::int IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM notifications n
               WHERE n.user_id = u.id AND n.title = $1
                 AND n.created_at > now() - make_interval(mins => $4)
            )
          )`,
      [title, ids.student, ids.student, dedupeMins]
    );

  await check("reaches admins and the assigned advisor, and nobody else", async () => {
    await notifyStaff("upload one");
    const { rows } = await db.query(
      `SELECT user_id FROM notifications WHERE title = 'upload one' ORDER BY user_id`
    );
    const got = rows.map((r) => r.user_id).sort();
    const want = [ids.superAdmin, ids.admin, ids.advisor].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`recipients were ${got.join(", ")}`);
    }
  });

  await check("a suspended admin and an unrelated advisor are left out", async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE title = 'upload one' AND user_id IN ($1, $2)`,
      [ids.suspendedAdmin, ids.otherAdvisor]
    );
    if (rows[0].n !== 0) throw new Error("they were notified");
  });

  await check("the actor is never told about their own action", async () => {
    await db.query(
      `INSERT INTO notifications (user_id, title, body, href, kind)
       SELECT u.id, 'self test', NULL, '/x', 'general' FROM users u
        WHERE u.role IN ('admin','super_admin') AND u.status = 'active'
          AND u.id <> $1`,
      [ids.admin]
    );
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM notifications WHERE title = 'self test' AND user_id = $1`,
      [ids.admin]
    );
    if (rows[0].n !== 0) throw new Error("the actor was notified");
  });

  await check("the dedupe window suppresses a repeat", async () => {
    await notifyStaff("autosave", 60);
    await notifyStaff("autosave", 60);
    await notifyStaff("autosave", 60);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM notifications WHERE title = 'autosave'`
    );
    // Three recipients, one round each — not three rounds.
    if (rows[0].n !== 3) throw new Error(`${rows[0].n} rows, expected 3`);
  });

  await check("without a window every event is kept", async () => {
    await notifyStaff("receipt");
    await notifyStaff("receipt");
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM notifications WHERE title = 'receipt'`
    );
    if (rows[0].n !== 6) throw new Error(`${rows[0].n} rows, expected 6`);
  });
}

console.log("\nApplication queries\n");

await check("admin metrics aggregate", async () => {
  await db.query(`
    SELECT
      (SELECT count(*)::int FROM users) AS total_users,
      (SELECT count(*)::int FROM users WHERE role='student') AS students,
      (SELECT count(*)::int FROM cases WHERE status NOT IN ('completed','closed')) AS open_cases,
      (SELECT count(*)::int FROM documents WHERE status IN ('uploaded','pending_review')) AS pending_documents,
      (SELECT count(*)::int FROM messages WHERE read_at IS NULL) AS unread_messages
  `);
});

await check("advisor case scoping join", async () => {
  await db.query(`
    SELECT c.*, u.name AS client_name, a.name AS advisor_name
    FROM cases c
    JOIN users u ON u.id = c.client_id
    LEFT JOIN users a ON a.id = c.advisor_id
    WHERE c.advisor_id = gen_random_uuid()
       OR EXISTS (SELECT 1 FROM staff_assignments sa
                  WHERE sa.advisor_id = gen_random_uuid() AND sa.client_id = c.client_id)
  `);
});

await check("conversation unread subquery", async () => {
  await db.query(`
    SELECT c.id, c.subject, c.updated_at,
           (SELECT count(*)::int FROM messages m
            WHERE m.conversation_id = c.id AND m.read_at IS NULL) AS unread
    FROM conversations c ORDER BY c.updated_at DESC
  `);
});

await check("user filter with nullable params", async () => {
  await db.query(
    `SELECT id FROM users
     WHERE ($1::text IS NULL OR name ILIKE $1)
       AND ($2::user_role IS NULL OR role = $2::user_role)
       AND ($3::user_status IS NULL OR status = $3::user_status)
     ORDER BY created_at DESC LIMIT 10`,
    [null, null, null]
  );
});

await check("audit insert with jsonb meta", async () => {
  await db.query(
    `INSERT INTO audit_logs (actor_email, action, entity, meta)
     VALUES ($1,$2,$3,$4)`,
    ["a@b.io", "auth.login", "user", JSON.stringify({ role: "student" })]
  );
});

await check("document review update", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('d@t.io','D','student','x') RETURNING id`
  );
  const d = await db.query(
    `INSERT INTO documents (owner_id,name,category,status) VALUES ($1,'Passport','Identity','uploaded') RETURNING id`,
    [u.rows[0].id]
  );
  await db.query(
    `UPDATE documents SET status=$2::document_status, reviewed_at=now(), updated_at=now() WHERE id=$1`,
    [d.rows[0].id, "approved"]
  );
});

console.log("\nMCP read queries\n");

/*
  THE ONE FAILURE MODE THAT LOOKS LIKE AN EMPTY PORTAL.

  Both queries run inside safeQuery, which logs and returns the fallback. A
  wrong column name therefore does not raise anything a person would see — it
  returns { count: 0, clients: [] }, and Claude reports, with complete
  confidence, that there are no students. That is worse than an error, because
  an error gets fixed and a confident wrong answer gets acted on.

  This already caught one: staff_assignments has created_at, not assigned_at.

  The SQL is restated here with positional parameters rather than imported —
  postgres.js tagged templates cannot be run against PGlite. It is the column
  names, the casts and the shape that are being checked, which is where the
  mistakes are.
*/
{
  const ids = {
    student: "aaaaaaaa-0000-0000-0000-000000000001",
    other: "aaaaaaaa-0000-0000-0000-000000000002",
    advisor: "aaaaaaaa-0000-0000-0000-000000000003",
  };

  await check("fixtures", async () => {
    await db.query(
      `INSERT INTO users (id, email, name, role, status, password_hash) VALUES
        ($1,'mcp.a@test','Ayesha Khan','student','active','x'),
        ($2,'mcp.b@test','Bilal Ahmed','student','suspended','x'),
        ($3,'mcp.adv@test','Advisor One','advisor','active','x')`,
      [ids.student, ids.other, ids.advisor]
    );
    await db.query(
      `INSERT INTO staff_assignments (client_id, advisor_id) VALUES ($1, $2)`,
      [ids.student, ids.advisor]
    );
    await db.query(
      `INSERT INTO intake_forms (user_id, pathway, status, data, submitted_at)
       VALUES ($1,'study','submitted',$2::jsonb, now()),
              ($3,'study','draft',$4::jsonb, NULL)`,
      [
        ids.student,
        JSON.stringify({
          passportNo: "AB1234567",
          dob: "2001-04-11",
          edu: [{ eduSchool: "Govt College" }, { eduSchool: "Punjab University" }],
        }),
        ids.other,
        JSON.stringify({ passportNo: "ZZ9999999" }),
      ]
    );
    await db.query(
      `INSERT INTO documents (owner_id, name, category, status)
       VALUES ($1,'Passport.pdf','passport','pending_review'),
              ($1,'Transcript.pdf','education','approved')`,
      [ids.student]
    );
  });

  const CLIENT_ROLES = ["student", "professional", "business"];

  const findClients = (q, status, awaiting, limit) =>
    db.query(
      `SELECT u.id, u.name, u.email, u.role::text AS role, u.status::text AS status,
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
        WHERE u.role::text = ANY($1::text[])
          AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)
          AND ($3::text IS NULL OR u.status::text = $3)
          AND ($4 = false OR EXISTS (
                SELECT 1 FROM documents d
                 WHERE d.owner_id = u.id AND d.status IN ('uploaded','pending_review')))
        ORDER BY u.created_at DESC
        LIMIT $5`,
      [CLIENT_ROLES, q, status, awaiting, limit]
    );

  await check("find_clients runs and reports where each client stands", async () => {
    // Scoped to this section's own fixtures. Earlier sections insert users of
    // their own, and a global count would make this fail whenever one of them
    // adds a row — a test that breaks for reasons unrelated to what it checks
    // is one people learn to ignore.
    const { rows } = await findClients("%mcp.%", null, false, 50);
    if (rows.length !== 2) throw new Error(`${rows.length} clients, expected 2 (the advisor is not one)`);
    const ayesha = rows.find((r) => r.name === "Ayesha Khan");
    if (!ayesha) throw new Error("the student was not returned");
    if (ayesha.application_status !== "submitted") throw new Error("application status was not read");
    if (Number(ayesha.documents) !== 2) throw new Error("documents were not counted");
    if (Number(ayesha.documents_awaiting_review) !== 1) {
      throw new Error(`${ayesha.documents_awaiting_review} awaiting review, expected 1`);
    }
    // The column that was wrong. An advisor read through the wrong name
    // returns nothing AND takes the whole query down with it.
    if (ayesha.advisor !== "Advisor One") throw new Error("the assigned advisor was not found");
    if (ayesha.fee_status !== null) throw new Error("a fee status appeared from nowhere");
  });

  await check("its filters actually filter", async () => {
    const byName = await findClients("%ayesha%", null, false, 50);
    if (byName.rows.length !== 1) throw new Error("the name filter matched " + byName.rows.length);

    const suspended = await findClients("%mcp.%", "suspended", false, 50);
    if (suspended.rows.length !== 1 || suspended.rows[0].name !== "Bilal Ahmed") {
      throw new Error("the status filter is wrong");
    }

    const awaiting = await findClients("%mcp.%", null, true, 50);
    if (awaiting.rows.length !== 1 || awaiting.rows[0].name !== "Ayesha Khan") {
      throw new Error("the awaiting-review filter is wrong");
    }
  });

  const exportFields = (q, submittedOnly, limit) =>
    db.query(
      `SELECT u.id, u.name, u.email, i.status::text AS status, i.submitted_at, i.data
         FROM users u
         JOIN intake_forms i ON i.user_id = u.id
        WHERE u.role::text = ANY($1::text[])
          AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)
          AND ($3 = false OR i.submitted_at IS NOT NULL)
        ORDER BY u.name ASC
        LIMIT $4`,
      [CLIENT_ROLES, q, submittedOnly, limit]
    );

  await check("export_application_fields returns the stored answers", async () => {
    const { rows } = await exportFields(null, false, 100);
    if (rows.length !== 2) throw new Error(`${rows.length} rows, expected 2`);
    const ayesha = rows.find((r) => r.name === "Ayesha Khan");
    if (ayesha.data.passportNo !== "AB1234567") throw new Error("the answers did not come back");
    if (!Array.isArray(ayesha.data.edu) || ayesha.data.edu.length !== 2) {
      throw new Error("repeated answers did not survive the round trip");
    }
  });

  await check("submittedOnly excludes a draft nobody has sent", async () => {
    const { rows } = await exportFields(null, true, 100);
    if (rows.length !== 1) throw new Error(`${rows.length} rows, expected only the submitted one`);
    if (rows[0].name !== "Ayesha Khan") throw new Error("the wrong row survived");
  });
}

console.log("\nOperational layer (003)\n");

await check("case reference is auto-assigned and unique", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('ref@t.io','R','student','x') RETURNING id`
  );
  const a = await db.query(
    `INSERT INTO cases (client_id,pathway,title) VALUES ($1,'study','A') RETURNING reference`,
    [u.rows[0].id]
  );
  const b = await db.query(
    `INSERT INTO cases (client_id,pathway,title) VALUES ($1,'study','B') RETURNING reference`,
    [u.rows[0].id]
  );
  const ra = a.rows[0].reference, rb = b.rows[0].reference;
  if (!/^SNZ-\d{4}-\d{4}$/.test(ra)) throw new Error(`bad reference format: ${ra}`);
  if (ra === rb) throw new Error("two cases received the same reference");
});

await check("an OAuth account needs no password", async () => {
  await db.query(
    `INSERT INTO users (email,name,role,auth_provider,oauth_subject)
     VALUES ('g@t.io','G','student','google','sub-123')`
  );
});

await check("an account with neither credential is rejected", async () => {
  let ok = false;
  try {
    await db.query(`INSERT INTO users (email,name,role) VALUES ('n@t.io','N','student')`);
  } catch {
    ok = true;
  }
  if (!ok) throw new Error("users_has_credential did not fire");
});

await check("the same Google identity cannot map to two accounts", async () => {
  let ok = false;
  try {
    await db.query(
      `INSERT INTO users (email,name,role,auth_provider,oauth_subject)
       VALUES ('g2@t.io','G2','student','google','sub-123')`
    );
  } catch {
    ok = true;
  }
  if (!ok) throw new Error("oauth subject uniqueness did not hold");
});

await check("one live intake per pathway per user", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('i@t.io','I','student','x') RETURNING id`
  );
  await db.query(
    `INSERT INTO intake_forms (user_id,pathway,data) VALUES ($1,'study','{"a":1}'::jsonb)`,
    [u.rows[0].id]
  );
  let ok = false;
  try {
    await db.query(
      `INSERT INTO intake_forms (user_id,pathway) VALUES ($1,'study')`,
      [u.rows[0].id]
    );
  } catch {
    ok = true;
  }
  if (!ok) throw new Error("a second draft was allowed to fork the answers");
});

await check("client-visible history excludes internal entries", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('h@t.io','H','student','x') RETURNING id`
  );
  const id = u.rows[0].id;
  await db.query(
    `INSERT INTO status_history (entity,entity_id,subject_id,to_status,internal)
     VALUES ('case',$1,$1,'under_review',false), ('case',$1,$1,'flagged',true)`,
    [id]
  );
  const r = await db.query(
    `SELECT count(*)::int AS n FROM status_history WHERE subject_id=$1 AND internal=false`,
    [id]
  );
  if (r.rows[0].n !== 1) throw new Error(`client query returned ${r.rows[0].n} rows, expected 1`);
});

await check("a later intake step merges rather than overwrites", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('m@t.io','M','student','x') RETURNING id`
  );
  const id = u.rows[0].id;
  await db.query(
    `INSERT INTO intake_forms (user_id,pathway,step,data) VALUES ($1,'study',1,'{"firstName":"Ada"}'::jsonb)`,
    [id]
  );
  await db.query(
    `INSERT INTO intake_forms (user_id,pathway,step,data) VALUES ($1,'study',2,'{"degree":"BSc"}'::jsonb)
     ON CONFLICT (user_id,pathway) DO UPDATE
       SET data=intake_forms.data || EXCLUDED.data,
           step=GREATEST(intake_forms.step, EXCLUDED.step)
       WHERE intake_forms.status='draft'`,
    [id]
  );
  const r = await db.query(`SELECT data, step FROM intake_forms WHERE user_id=$1`, [id]);
  const d = r.rows[0].data;
  if (d.firstName !== "Ada") throw new Error("step 1 answers were wiped by step 2");
  if (d.degree !== "BSc") throw new Error("step 2 answers were not stored");
  if (r.rows[0].step !== 2) throw new Error(`resume point is ${r.rows[0].step}, expected 2`);

  // Going back to edit step 1 must not drag the resume point backwards.
  await db.query(
    `INSERT INTO intake_forms (user_id,pathway,step,data) VALUES ($1,'study',1,'{"firstName":"Grace"}'::jsonb)
     ON CONFLICT (user_id,pathway) DO UPDATE
       SET data=intake_forms.data || EXCLUDED.data,
           step=GREATEST(intake_forms.step, EXCLUDED.step)
       WHERE intake_forms.status='draft'`,
    [id]
  );
  const r2 = await db.query(`SELECT data, step FROM intake_forms WHERE user_id=$1`, [id]);
  if (r2.rows[0].step !== 2) throw new Error("editing an earlier step reset the resume point");
  if (r2.rows[0].data.firstName !== "Grace") throw new Error("the edit did not take");
});

await check("a submitted intake stops accepting draft writes", async () => {
  const u = await db.query(
    `INSERT INTO users (email,name,role,password_hash) VALUES ('s@t.io','S','student','x') RETURNING id`
  );
  const id = u.rows[0].id;
  await db.query(
    `INSERT INTO intake_forms (user_id,pathway,step,data,status,submitted_at)
     VALUES ($1,'study',9,'{"final":true}'::jsonb,'submitted',now())`,
    [id]
  );
  await db.query(
    `INSERT INTO intake_forms (user_id,pathway,step,data) VALUES ($1,'study',1,'{"tampered":true}'::jsonb)
     ON CONFLICT (user_id,pathway) DO UPDATE
       SET data=intake_forms.data || EXCLUDED.data
       WHERE intake_forms.status='draft'`,
    [id]
  );
  const r = await db.query(`SELECT data FROM intake_forms WHERE user_id=$1`, [id]);
  if (r.rows[0].data.tampered) throw new Error("a submitted form was still writable");
});

await db.close();

console.log(
  failures === 0
    ? "\n  Schema verified — all checks passed.\n"
    : `\n  ${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);

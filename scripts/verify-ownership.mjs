/**
 * WHOSE CLIENT IS THIS, ON EVERY SCREEN THAT CLAIMS TO SAY?
 *
 *   npm run verify:ownership
 *
 * The Cases table, the users list and the client file all have a column for
 * the person who owns a client, and all three read "—" for every student who
 * arrived through a consultant's link. The data was never missing. The queries
 * asked `cases.advisor_id`, which is only ever set by a deliberate, manual
 * case assignment — nothing in the enrolment flow touches it — while the
 * enrolment itself writes `staff_assignments`.
 *
 * A wrong join produces an empty column, not an error, so nothing failed and
 * nothing was logged: the only way this gets caught is a test that asserts the
 * name. That is what this file is.
 *
 * It exercises the ownership fragment as the repo writes it. Duplicated here
 * rather than imported, for the reason given in verify-invites.mjs: the repo
 * reaches for a live postgres.js connection at module load. Any change to
 * those queries must be mirrored here.
 *
 * Runs against an in-memory Postgres. It never touches a real database and
 * needs no credentials.
 */
import "./lib/env.mjs";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "lib", "db", "migrations");
const db = new PGlite();

let failures = 0;
const fail = (m, detail) => {
  failures++;
  console.log(`  FAIL  ${m}${detail ? `\n        ${detail}` : ""}`);
};
const ok = (m) => console.log(`  ok    ${m}`);

const check = async (label, fn) => {
  try {
    await fn();
    ok(label);
  } catch (error) {
    fail(label, error.message?.split("\n")[0]);
  }
};

/* ------------------------------------------------------------- schema --- */

for (const f of (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await fs.readFile(path.join(DIR, f), "utf8"));
}

let seq = 0;
async function user(role, name) {
  seq++;
  const r = await db.query(
    `INSERT INTO users (email, name, role, status, password_hash)
     VALUES ($1, $2, $3, 'active', 'x') RETURNING id`,
    [`u${seq}@example.com`, name ?? `User ${seq}`, role]
  );
  return r.rows[0].id;
}

async function openCase(clientId, { advisorId = null, title = "Study" } = {}) {
  const r = await db.query(
    `INSERT INTO cases (client_id, advisor_id, pathway, title)
     VALUES ($1, $2, 'study', $3) RETURNING id`,
    [clientId, advisorId, title]
  );
  return r.rows[0].id;
}

/**
 * The enrolment side-effect, as claimInvite writes it. `assigned_by` is the
 * consultant themselves because nobody else was involved.
 */
async function enrol(clientId, advisorId, at = null) {
  await db.query(
    `INSERT INTO staff_assignments (client_id, advisor_id, assigned_by, created_at)
     VALUES ($1, $2, $2, COALESCE($3::timestamptz, now()))
     ON CONFLICT (client_id, advisor_id) DO NOTHING`,
    [clientId, advisorId, at]
  );
}

/* ------------------------------------------------- the ownership fragment */

/** getAllCases / getCasesForClient — the LATERAL, verbatim. */
const casesFor = (where) => `
  SELECT c.id, c.reference, u.name AS client_name,
         a.name AS advisor_name, cons.name AS consultant_name
  FROM cases c
  JOIN users u ON u.id = c.client_id
  LEFT JOIN users a ON a.id = c.advisor_id
  LEFT JOIN LATERAL (
    SELECT adv.name FROM staff_assignments sa
    JOIN users adv ON adv.id = sa.advisor_id
    WHERE sa.client_id = c.client_id
    ORDER BY sa.created_at ASC LIMIT 1
  ) cons ON TRUE
  ${where}
  ORDER BY c.updated_at DESC
`;

/** getUsersPageData — the same LATERAL, hung off the user rather than the case. */
const USERS = `
  SELECT u.id, u.name, cons.id AS advisor_id, cons.name AS advisor_name
  FROM users u
  LEFT JOIN LATERAL (
    SELECT adv.id, adv.name FROM staff_assignments sa
    JOIN users adv ON adv.id = sa.advisor_id
    WHERE sa.client_id = u.id
    ORDER BY sa.created_at ASC LIMIT 1
  ) cons ON TRUE
  WHERE u.id = $1
`;

/* -------------------------------------------------------------- the tests */

await check("fixtures", async () => {
  const c = await user("advisor", "Hina Malik");
  const s = await user("student", "Ali Raza");
  await enrol(s, c);
  await openCase(s);
  const r = await db.query(casesFor("WHERE c.client_id = $1"), [s]);
  if (r.rows.length !== 1) throw new Error(`${r.rows.length} rows`);
});

await check(
  "a student enrolled through a consultant's link shows that consultant",
  async () => {
    const c = await user("advisor", "Hina Malik");
    const s = await user("student");
    await enrol(s, c);
    await openCase(s);

    const [row] = (await db.query(casesFor("WHERE c.client_id = $1"), [s])).rows;
    // The bug, exactly: advisor_id is untouched by enrolment...
    if (row.advisor_name !== null) throw new Error("advisor_id was set by enrolment");
    // ...and the consultant is the answer the column should have been giving.
    if (row.consultant_name !== "Hina Malik") {
      throw new Error(`consultant was ${JSON.stringify(row.consultant_name)}`);
    }
  }
);

await check("an explicitly assigned case advisor is reported as well", async () => {
  const c = await user("advisor", "Hina Malik");
  const owner = await user("admin", "Sana Iqbal");
  const s = await user("student");
  await enrol(s, c);
  await openCase(s, { advisorId: owner });

  const [row] = (await db.query(casesFor("WHERE c.client_id = $1"), [s])).rows;
  if (row.advisor_name !== "Sana Iqbal") throw new Error("the case owner was lost");
  if (row.consultant_name !== "Hina Malik") throw new Error("the consultant was lost");
});

await check("a client with nobody reports nobody, rather than failing", async () => {
  const s = await user("student");
  await openCase(s);
  const [row] = (await db.query(casesFor("WHERE c.client_id = $1"), [s])).rows;
  if (row.advisor_name !== null || row.consultant_name !== null) {
    throw new Error("an unassigned client was given an owner");
  }
});

await check("two consultants on one client does not duplicate the case", async () => {
  const first = await user("advisor", "First");
  const second = await user("advisor", "Second");
  const s = await user("student");
  await enrol(s, first, "2026-01-01T00:00:00Z");
  await enrol(s, second, "2026-06-01T00:00:00Z");
  await openCase(s);

  const rows = (await db.query(casesFor("WHERE c.client_id = $1"), [s])).rows;
  // Without LIMIT 1 in the LATERAL this is where the page silently starts
  // showing every case twice.
  if (rows.length !== 1) throw new Error(`${rows.length} rows for one case`);
  // Earliest wins: whoever enrolled them, not whoever was added since.
  if (rows[0].consultant_name !== "First") {
    throw new Error(`reported ${rows[0].consultant_name}`);
  }
});

await check("the users list reports the same consultant, and one row", async () => {
  const first = await user("advisor", "First");
  const second = await user("advisor", "Second");
  const s = await user("student");
  await enrol(s, first, "2026-01-01T00:00:00Z");
  await enrol(s, second, "2026-06-01T00:00:00Z");

  const rows = (await db.query(USERS, [s])).rows;
  if (rows.length !== 1) throw new Error(`${rows.length} rows for one user`);
  if (rows[0].advisor_name !== "First") throw new Error(`reported ${rows[0].advisor_name}`);
  // The select is driven by the id, not the name — a null id would reset it to
  // "Unassigned" on screen no matter what name came back.
  if (!rows[0].advisor_id) throw new Error("no advisor id, so the control cannot show it");
});

await check("a consultant is nobody's client", async () => {
  const c = await user("advisor", "Hina Malik");
  const [row] = (await db.query(USERS, [c])).rows;
  if (row.advisor_name !== null) throw new Error("a consultant was given a consultant");
});

/* ------------------------------------------- the two screens must agree */

/**
 * getAssignedClients — Your Students, and the authorization check behind the
 * client file and the document reads.
 */
const MINE = `
  SELECT u.id, u.name,
         count(c.id)::int AS case_count,
         count(c.id) FILTER (WHERE c.status NOT IN ('completed','closed'))::int AS open_cases
  FROM users u
  LEFT JOIN cases c
    ON c.client_id = u.id
   AND (c.advisor_id = $1
        OR EXISTS (SELECT 1 FROM staff_assignments sa2
                    WHERE sa2.advisor_id = $1 AND sa2.client_id = u.id))
  WHERE EXISTS (SELECT 1 FROM staff_assignments sa
                 WHERE sa.advisor_id = $1 AND sa.client_id = u.id)
     OR EXISTS (SELECT 1 FROM cases mine
                 WHERE mine.advisor_id = $1 AND mine.client_id = u.id)
  GROUP BY u.id, u.name
  ORDER BY u.name
`;

/** getCasesForAdvisor — the Cases page, for a consultant. */
const MY_CASES = `
  SELECT c.id FROM cases c
  WHERE c.advisor_id = $1
     OR EXISTS (SELECT 1 FROM staff_assignments sa
                 WHERE sa.advisor_id = $1 AND sa.client_id = c.client_id)
`;

await check("a case assigned to a consultant brings its student with it", async () => {
  const c = await user("advisor", "Hina Malik");
  const s = await user("student", "Ali Raza");
  // Assigned the CASE, never the client. This is how an admin hands over one
  // piece of work, and Your Students used to ignore it entirely.
  await openCase(s, { advisorId: c });

  const rows = (await db.query(MINE, [c])).rows;
  if (rows.length !== 1) throw new Error(`${rows.length} students`);
  if (rows[0].case_count !== 1) throw new Error(`${rows[0].case_count} cases on the row`);
});

await check("the student count and the case count come from the same set", async () => {
  const c = await user("advisor", "Hina Malik");
  const one = await user("student", "One");
  const two = await user("student", "Two");
  await enrol(one, c);
  await enrol(two, c);
  // Two students, three cases — which is exactly the shape that read as a
  // missing student, and is not one.
  await openCase(one, { title: "Bachelors" });
  await openCase(one, { title: "Masters" });
  await openCase(two, { title: "Bachelors" });

  const mine = (await db.query(MINE, [c])).rows;
  const cases = (await db.query(MY_CASES, [c])).rows;
  if (mine.length !== 2) throw new Error(`${mine.length} students`);
  if (cases.length !== 3) throw new Error(`${cases.length} cases`);

  // The whole point: every case the Cases page shows is accounted for by a row
  // on Your Students. Anything else is a number nobody can explain.
  const summed = mine.reduce((n, r) => n + r.case_count, 0);
  if (summed !== cases.length) {
    throw new Error(`Your Students accounts for ${summed} of ${cases.length} cases`);
  }
});

await check("somebody else's student is in neither", async () => {
  const mineAdv = await user("advisor", "Mine");
  const rival = await user("advisor", "Rival");
  const theirs = await user("student");
  await enrol(theirs, rival);
  await openCase(theirs);

  if ((await db.query(MINE, [mineAdv])).rows.length) throw new Error("a rival's student leaked");
  if ((await db.query(MY_CASES, [mineAdv])).rows.length) throw new Error("a rival's case leaked");
});

/* ------------------------------------------------- the reference, at all */

await check("every case carries the reference the pages now print", async () => {
  const s = await user("student");
  const id = await openCase(s);
  const [row] = (await db.query(`SELECT reference FROM cases WHERE id = $1`, [id])).rows;
  if (!/^SNZ-\d{4}-\d{4}$/.test(row.reference ?? "")) {
    throw new Error(`reference was ${JSON.stringify(row.reference)}`);
  }
});

console.log(
  failures ? `\n  ${failures} failing\n` : "\n  Ownership verified — all checks passed.\n"
);
process.exit(failures ? 1 : 0);

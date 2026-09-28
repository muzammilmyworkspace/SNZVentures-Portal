/**
 * WHOSE STUDENT IS THIS?
 *
 *   npm run verify:invites
 *
 * An enrolment link decides who is paid for a student, so every way of getting
 * a second answer out of it is worth a test. The rules this exercises are the
 * ones the DATABASE enforces — unique indexes and the conditions in the WHERE
 * clauses of lib/db/repos/invites.ts — because a rule the application checks
 * and the database does not is a rule that two simultaneous requests break.
 *
 * Runs against an in-memory Postgres. It never touches a real database and
 * needs no credentials.
 */
import "./lib/env.mjs";
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomBytes } from "node:crypto";
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

/** Must match lib/db/repos/invites.ts exactly, or these tests prove nothing. */
const hashToken = (raw) => createHash("sha256").update(raw).digest("hex");
const ENROLLABLE = ["student", "professional", "business"];
const CAN_HOLD = ["advisor", "admin", "super_admin"];

/* ------------------------------------------------------------- schema --- */

for (const f of (await fs.readdir(DIR)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await fs.readFile(path.join(DIR, f), "utf8"));
}

let seq = 0;
async function user(role, status = "active") {
  seq++;
  const res = await db.query(
    `INSERT INTO users (email, name, role, status, password_hash)
     VALUES ($1, $2, $3, $4, 'x') RETURNING id`,
    [`u${seq}@example.com`, `User ${seq}`, role, status]
  );
  return res.rows[0].id;
}

/** The INSERT from createInvite, with the expiry under the test's control. */
async function invite(consultantId, { days = 14 } = {}) {
  const raw = randomBytes(32).toString("base64url");
  const res = await db.query(
    `INSERT INTO student_invites (consultant_id, created_by, token_hash, expires_at)
     VALUES ($1, $1, $2, now() + ($3 || ' days')::interval) RETURNING id`,
    [consultantId, hashToken(raw), String(days)]
  );
  return { id: res.rows[0].id, token: raw };
}

/**
 * The body of `claimInvite`, statement for statement.
 *
 * Duplicated here rather than imported because the repo reaches for a live
 * postgres.js connection at module load. Any change to the real query must be
 * mirrored here — which is the cost of testing the SQL at all, and cheaper
 * than shipping an enrolment rule nothing exercises.
 */
async function claim(token, studentId) {
  try {
    await db.exec("BEGIN");

    const inv = await db.query(
      `SELECT id, consultant_id FROM student_invites
        WHERE token_hash = $1 AND claimed_at IS NULL AND revoked_at IS NULL
          AND expires_at > now()
        FOR UPDATE`,
      [hashToken(token)]
    );
    if (!inv.rows[0]) throw new Error("invalid");

    const consultantId = inv.rows[0].consultant_id;

    const con = await db.query(
      `SELECT id FROM users
        WHERE id = $1 AND status = 'active' AND role::text = ANY($2)`,
      [consultantId, CAN_HOLD]
    );
    if (!con.rows[0]) throw new Error("invalid");

    const stu = await db.query(`SELECT id FROM users WHERE id = $1 AND role::text = ANY($2)`, [
      studentId,
      ENROLLABLE,
    ]);
    if (!stu.rows[0]) throw new Error("not_a_client");

    const existing = await db.query(
      `SELECT 1 FROM staff_assignments WHERE client_id = $1 LIMIT 1`,
      [studentId]
    );
    if (existing.rows[0]) throw new Error("already_assigned");

    await db.query(
      `UPDATE student_invites SET claimed_by = $1, claimed_at = now() WHERE id = $2`,
      [studentId, inv.rows[0].id]
    );
    await db.query(
      `INSERT INTO staff_assignments (client_id, advisor_id, assigned_by) VALUES ($1, $2, $2)`,
      [studentId, consultantId]
    );

    await db.exec("COMMIT");
    return { ok: true, consultantId };
  } catch (error) {
    await db.exec("ROLLBACK");
    return { ok: false, reason: error.message === "not_a_client" ? "not_a_client" :
      error.message === "already_assigned" ? "already_assigned" : "invalid" };
  }
}

const refuses = async (result, reason) => {
  if (result.ok) throw new Error("it was ACCEPTED");
  if (reason && result.reason !== reason) {
    throw new Error(`refused as "${result.reason}", expected "${reason}"`);
  }
};

/* ------------------------------------------------------- the happy path --- */

console.log("\nEnrolling a student\n");

await check("a student who opens a link becomes that consultant's", async () => {
  const c = await user("advisor");
  const s = await user("student");
  const i = await invite(c);
  const r = await claim(i.token, s);
  if (!r.ok) throw new Error(`refused as "${r.reason}"`);

  const a = await db.query(
    `SELECT advisor_id FROM staff_assignments WHERE client_id = $1`,
    [s]
  );
  if (a.rows.length !== 1) throw new Error(`${a.rows.length} assignments written`);
  if (a.rows[0].advisor_id !== c) throw new Error("assigned to the wrong consultant");
});

await check("the invite records which account used it", async () => {
  const c = await user("advisor");
  const s = await user("student");
  const i = await invite(c);
  await claim(i.token, s);
  const row = await db.query(
    `SELECT claimed_by, claimed_at FROM student_invites WHERE id = $1`,
    [i.id]
  );
  if (row.rows[0].claimed_by !== s) throw new Error("claimed_by not recorded");
  if (!row.rows[0].claimed_at) throw new Error("claimed_at not recorded");
});

await check("the raw token is never stored", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  const row = await db.query(`SELECT token_hash FROM student_invites WHERE id = $1`, [i.id]);
  if (row.rows[0].token_hash === i.token) throw new Error("the token is in the table verbatim");
  if (row.rows[0].token_hash !== hashToken(i.token)) throw new Error("not the expected hash");
});

/* ------------------------------------------------------------ refusals --- */

console.log("\nWhat a link cannot do\n");

await check("one link cannot enrol two students", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  const first = await claim(i.token, await user("student"));
  if (!first.ok) throw new Error("the first claim was refused");
  await refuses(await claim(i.token, await user("student")), "invalid");
});

await check("one student cannot arrive through two links", async () => {
  const c = await user("advisor");
  const s = await user("student");
  if (!(await claim((await invite(c)).token, s)).ok) throw new Error("the first claim failed");
  // Second link, same consultant: refused before the unique index is reached.
  await refuses(await claim((await invite(c)).token, s), "already_assigned");
});

await check("a rival consultant cannot re-enrol somebody else's student", async () => {
  const mine = await user("advisor");
  const rival = await user("advisor");
  const s = await user("student");
  await claim((await invite(mine)).token, s);
  await refuses(await claim((await invite(rival)).token, s), "already_assigned");

  const a = await db.query(`SELECT advisor_id FROM staff_assignments WHERE client_id = $1`, [s]);
  if (a.rows.length !== 1 || a.rows[0].advisor_id !== mine) {
    throw new Error("the original assignment did not survive");
  }
});

await check("an expired link does not work", async () => {
  const c = await user("advisor");
  const i = await invite(c, { days: -1 });
  await refuses(await claim(i.token, await user("student")), "invalid");
});

await check("a withdrawn link does not work", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  await db.query(`UPDATE student_invites SET revoked_at = now() WHERE id = $1`, [i.id]);
  await refuses(await claim(i.token, await user("student")), "invalid");
});

await check("a suspended consultant's link stops working", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [c]);
  await refuses(await claim(i.token, await user("student")), "invalid");
});

await check("a consultant demoted to client can no longer receive students", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  await db.query(`UPDATE users SET role = 'student' WHERE id = $1`, [c]);
  await refuses(await claim(i.token, await user("student")), "invalid");
});

await check("staff cannot be enrolled as somebody's client", async () => {
  const c = await user("advisor");
  for (const role of ["advisor", "admin", "super_admin"]) {
    await refuses(await claim((await invite(c)).token, await user(role)), "not_a_client");
  }
});

await check("a guessed token is refused", async () => {
  const c = await user("advisor");
  await invite(c);
  await refuses(await claim(randomBytes(32).toString("base64url"), await user("student")), "invalid");
});

await check("a refused claim writes nothing at all", async () => {
  const c = await user("advisor");
  const s = await user("student");
  const i = await invite(c, { days: -1 });
  await claim(i.token, s);

  const a = await db.query(`SELECT 1 FROM staff_assignments WHERE client_id = $1`, [s]);
  if (a.rows.length) throw new Error("an assignment was written anyway");
  const row = await db.query(`SELECT claimed_by FROM student_invites WHERE id = $1`, [i.id]);
  if (row.rows[0].claimed_by) throw new Error("the invite was marked claimed anyway");
});

/* ------------------------------------------------- database guarantees --- */

console.log("\nWhat the database refuses on its own\n");

await check("the same account cannot be claimed_by twice, index-level", async () => {
  const c = await user("advisor");
  const s = await user("student");
  const a = await invite(c);
  const b = await invite(c);
  await db.query(`UPDATE student_invites SET claimed_by = $1, claimed_at = now() WHERE id = $2`, [s, a.id]);
  try {
    await db.query(`UPDATE student_invites SET claimed_by = $1, claimed_at = now() WHERE id = $2`, [s, b.id]);
    throw new Error("the second row was accepted");
  } catch (error) {
    if (!/unique|duplicate/i.test(error.message)) throw error;
  }
});

await check("unclaimed rows are not constrained by that index", async () => {
  const c = await user("advisor");
  await invite(c);
  await invite(c);
  await invite(c);
  const n = await db.query(
    `SELECT count(*)::int AS n FROM student_invites WHERE consultant_id = $1 AND claimed_by IS NULL`,
    [c]
  );
  if (n.rows[0].n !== 3) throw new Error(`${n.rows[0].n} unclaimed rows survived, expected 3`);
});

await check("claimed_by and claimed_at cannot disagree", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  try {
    await db.query(`UPDATE student_invites SET claimed_by = $1 WHERE id = $2`, [await user("student"), i.id]);
    throw new Error("a half-claimed row was accepted");
  } catch (error) {
    if (!/constraint|check/i.test(error.message)) throw error;
  }
});

await check("deleting a consultant takes their unused links, not their students", async () => {
  const c = await user("advisor");
  const s = await user("student");
  await claim((await invite(c)).token, s);
  await invite(c); // unused
  await db.query(`DELETE FROM users WHERE id = $1`, [c]);

  const left = await db.query(`SELECT count(*)::int AS n FROM student_invites WHERE consultant_id = $1`, [c]);
  if (left.rows[0].n !== 0) throw new Error("links outlived the consultant");
  const student = await db.query(`SELECT 1 FROM users WHERE id = $1`, [s]);
  if (!student.rows.length) throw new Error("the student was deleted too");
});

/* -------------------------------------------------------- the safety net --- */

console.log("\nThe unassigned queue\n");

await check("an unassigned client is listed, an assigned one is not", async () => {
  const c = await user("advisor");
  const enrolled = await user("student");
  const orphan = await user("student");
  await claim((await invite(c)).token, enrolled);

  const rows = await db.query(
    `SELECT u.id FROM users u
      WHERE u.role::text = ANY($1) AND u.status <> 'suspended'
        AND NOT EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.client_id = u.id)`,
    [ENROLLABLE]
  );
  const ids = rows.rows.map((r) => r.id);
  if (!ids.includes(orphan)) throw new Error("the unassigned client is missing");
  if (ids.includes(enrolled)) throw new Error("an assigned client is listed as unassigned");
});

await check("staff never appear in the unassigned queue", async () => {
  const a = await user("admin");
  const rows = await db.query(
    `SELECT u.id FROM users u
      WHERE u.role::text = ANY($1) AND u.status <> 'suspended'
        AND NOT EXISTS (SELECT 1 FROM staff_assignments sa WHERE sa.client_id = u.id)`,
    [ENROLLABLE]
  );
  if (rows.rows.map((r) => r.id).includes(a)) throw new Error("an admin is listed as unassigned");
});

/* ---------------------------------------------------------- withdrawal --- */

console.log("\nWithdrawing a link\n");

const revoke = (id, consultantId) =>
  db.query(
    `UPDATE student_invites SET revoked_at = now()
      WHERE id = $1 AND consultant_id = $2 AND claimed_at IS NULL AND revoked_at IS NULL
      RETURNING id`,
    [id, consultantId]
  );

await check("a consultant can withdraw their own unused link", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  const r = await revoke(i.id, c);
  if (!r.rows.length) throw new Error("it was not withdrawn");
});

await check("a consultant cannot withdraw somebody else's link", async () => {
  const mine = await user("advisor");
  const rival = await user("advisor");
  const i = await invite(mine);
  const r = await revoke(i.id, rival);
  if (r.rows.length) throw new Error("a rival withdrew it");
});

await check("an enrolment that has happened cannot be withdrawn", async () => {
  const c = await user("advisor");
  const i = await invite(c);
  await claim(i.token, await user("student"));
  const r = await revoke(i.id, c);
  if (r.rows.length) throw new Error("a claimed invite was withdrawn");
});

console.log(
  failures ? `\n  ${failures} failing\n` : "\n  Enrolment verified — all checks passed.\n"
);
process.exit(failures ? 1 : 0);

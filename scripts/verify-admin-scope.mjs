/**
 * A CONSULTANT MUST NOT SEE THE FIRM'S QUEUES.
 *
 *   npm run verify:admin-scope
 *
 * The admin area is shared: `requireStaff` lets an advisor in, `requireAdmin`
 * does not. That distinction is invisible on the page itself — both are one
 * line at the top, both compile, both render — and getting it wrong shows no
 * symptom at all until somebody with no students of their own opens Requests
 * and reads three other people's intakes. Which is what happened.
 *
 * So every page under app/portal/admin must EITHER require an admin, or be
 * named here with the reason it is safe for an advisor. Adding a page and not
 * thinking about it fails, which is the point: the failure mode is silent and
 * the check has to be the thing that is not.
 *
 * This asserts the guard, not the query. A page that requires an admin cannot
 * leak to a consultant whatever it fetches; a page on the list below has had
 * its scoping read by a person, and that judgement is recorded here.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "app", "portal", "admin");

let failures = 0;
const fail = (m, detail) => {
  failures++;
  console.log(`  FAIL  ${m}${detail ? `\n        ${detail}` : ""}`);
};
const ok = (m) => console.log(`  ok    ${m}`);

/**
 * Pages an advisor may open, each with the reason.
 *
 * The reason is not decoration. Anybody adding to this list is claiming the
 * page is scoped, and the next person to read it needs to know what that claim
 * rested on.
 */
const ADVISOR_SAFE = {
  ".": "The dashboard renders advisorWork for a non-admin — their own cases and clients.",
  cases: "getCasesForAdvisor joins staff_assignments; only an admin gets getAllCases.",
  "my-students": "getAssignedClients and getCasesForAdvisor, both scoped to the session user.",
  "users/[id]": "An advisor is 404'd for a client not assigned to them, resolved in SQL.",
  "forms/consent": "An advisor sees only the consent text in use (activeConsent); no client data, and the editing parts are super admin only.",
};

async function pages(dir, prefix = "") {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await pages(path.join(dir, entry.name), rel)));
    else if (entry.name === "page.tsx") out.push(prefix || ".");
  }
  return out;
}

console.log("\nWho can open each admin page\n");

const found = await pages(DIR);
if (found.length < 5) {
  fail(`only ${found.length} pages found under app/portal/admin — is the path right?`);
}

for (const page of found.sort()) {
  const file = path.join(DIR, page === "." ? "page.tsx" : path.join(page, "page.tsx"));
  const src = await fs.readFile(file, "utf8");

  const adminGuarded =
    /requireAdmin\s*\(/.test(src) ||
    /requireSuperAdmin\s*\(/.test(src) ||
    // requireArea (lib/auth/permissions) runs requireAdmin first, then the employee area check.
    /requireArea\s*\(/.test(src) ||
    // requireAreaOrDesk: requireAdmin, then the student desk or the area check.
    /requireAreaOrDesk\s*\(/.test(src) ||
    /requireRole\s*\(\s*ADMIN_ROLES/.test(src);

  const reason = ADVISOR_SAFE[page];

  if (adminGuarded) {
    if (reason) {
      fail(
        `${page} requires an admin but is also listed as advisor-safe`,
        "One of the two is out of date. Remove it from ADVISOR_SAFE."
      );
    }
    continue;
  }

  if (!reason) {
    fail(
      `${page} does not require an admin`,
      "An advisor can open it. Either guard it with requireAdmin, or add it to " +
        "ADVISOR_SAFE with the reason its queries are scoped to the session user."
    );
  }
}

if (!failures) {
  ok(`${found.length} admin pages: every one requires an admin or is a scoped advisor view`);
  for (const [page, reason] of Object.entries(ADVISOR_SAFE)) {
    ok(`advisor may open ${page} — ${reason}`);
  }
}

console.log(
  failures ? `\n  ${failures} failing\n` : "\n  Admin scoping verified.\n"
);
process.exit(failures ? 1 : 0);

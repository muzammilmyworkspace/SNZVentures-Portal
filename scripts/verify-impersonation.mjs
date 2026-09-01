/**
 * WHO MAY VIEW THE PORTAL AS WHOM.
 *
 *   npm run verify:impersonation
 *
 * This is the security-relevant half of the feature, and it is exactly the
 * kind of rule that reads correctly while being wrong: every case is a short
 * conditional, and the dangerous ones are the combinations nobody pictured.
 * An admin stepping into a super admin is privilege escalation wearing a
 * support-tool badge, so it is asserted rather than assumed.
 */
import {
  refuseImpersonation,
  sealedWhileImpersonating,
  IMPERSONATION_MAX_AGE_SECONDS,
} from "../lib/auth/impersonation.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const actor = (role, extra = {}) => ({
  userId: "actor-1",
  email: "admin@snz",
  name: "Admin",
  role,
  exp: 0,
  ...extra,
});
const target = (role, status = "active", id = "target-1") => ({ id, role, status });

const check = (label, result, expected) => {
  if (result !== expected) fail(`${label} — expected ${expected ?? "allowed"}, got ${result ?? "allowed"}`);
};

console.log("\n=== who may view as whom ===");

/* The point of the feature. */
for (const role of ["student", "professional", "business"]) {
  check(`admin → ${role}`, refuseImpersonation({ actor: actor("admin"), target: target(role) }), null);
  check(`super_admin → ${role}`, refuseImpersonation({ actor: actor("super_admin"), target: target(role) }), null);
}
ok("admins can view as any active client");

/* THE ESCALATION CASES. An admin stepping into a super admin would hand
   themselves a role they do not have, through a button labelled "support". */
for (const staff of ["advisor", "admin", "super_admin"]) {
  check(`admin → ${staff}`, refuseImpersonation({ actor: actor("admin"), target: target(staff) }), "staff-target");
  check(`super_admin → ${staff}`, refuseImpersonation({ actor: actor("super_admin"), target: target(staff) }), "staff-target");
}
ok("no staff account can be viewed as, by anyone");

/* Nobody below admin gets in at all. */
for (const role of ["student", "professional", "business", "advisor"]) {
  check(`${role} → student`, refuseImpersonation({ actor: actor(role), target: target("student") }), "not-staff");
}
ok("advisors and clients cannot view as anyone");

/* Chaining hides who started it, and the way back is one step by design. */
check(
  "already viewing as somebody",
  refuseImpersonation({
    actor: actor("admin", { impersonator: { userId: "x", email: "e", name: "n", role: "admin", since: 0 } }),
    target: target("student"),
  }),
  "already-impersonating"
);
ok("a view-as cannot start another");

/* Stepping into a suspended account would reach past the control that
   suspended it. */
for (const status of ["suspended", "pending", "deleted"]) {
  check(`${status} target`, refuseImpersonation({ actor: actor("admin"), target: target("student", status) }), "inactive");
}
ok("suspended and pending accounts are closed");

check(
  "self",
  refuseImpersonation({ actor: actor("admin"), target: target("admin", "active", "actor-1") }),
  "self"
);
ok("you cannot view as yourself");

console.log("\n=== what stays sealed ===");
for (const p of ["/api/portal/password", "/api/auth/reset-password", "/api/portal/profile/email"]) {
  if (!sealedWhileImpersonating(p)) fail(`${p} is reachable while viewing as somebody`);
}
/* Almost everything must stay OPEN — a support view that blocks what the
   client can do shows you a portal the client never sees. */
for (const p of ["/api/portal/fee", "/api/portal/documents", "/api/portal/intake", "/api/portal/checklist"]) {
  if (sealedWhileImpersonating(p)) fail(`${p} is blocked, so the view is not what the client sees`);
}
ok("only the sign-in-changing routes are sealed");

if (IMPERSONATION_MAX_AGE_SECONDS > 60 * 60) fail("a view-as lasts longer than an hour");
else ok(`a view-as expires after ${IMPERSONATION_MAX_AGE_SECONDS / 60} minutes`);

console.log(
  failures === 0
    ? "\n  View-as rules verified.\n"
    : `\n  ${failures} FAILURE(S)\n`
);
process.exit(failures === 0 ? 0 : 1);

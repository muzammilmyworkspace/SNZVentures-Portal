/**
 * HOW LONG A SESSION LASTS, ASSERTED RATHER THAN ASSUMED.
 *
 *   npm run verify:session
 *
 * A session lifetime is exactly the kind of constant that drifts back
 * silently — somebody widens it "just for testing", a merge picks the wrong
 * side, and the only symptom is a portal that stays signed in for a week when
 * it was set to sign out in a day. Nothing breaks; it just quietly stops being
 * true. That is the bug this file exists to catch before it reaches anyone.
 */
process.env.AUTH_SECRET = "a".repeat(32);

import { SESSION_MAX_AGE_SECONDS } from "../lib/auth/constants.ts";
import { createToken, verifyToken } from "../lib/auth/token.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const PERSON = { userId: "u1", email: "a@test", role: "student", name: "A" };

console.log("\n=== the lifetime itself ===");
{
  const DAY = 60 * 60 * 24;
  if (SESSION_MAX_AGE_SECONDS !== DAY) {
    fail(
      `SESSION_MAX_AGE_SECONDS is ${SESSION_MAX_AGE_SECONDS}s ` +
        `(${(SESSION_MAX_AGE_SECONDS / DAY).toFixed(2)} days), not the one-day session this portal ` +
        `promises. A closed browser reopened after this period must be signed out.`
    );
  } else {
    ok("the session lasts exactly one day, not the old seven");
  }
}

console.log("\n=== what a token actually carries ===");
{
  const before = Math.floor(Date.now() / 1000);
  const token = createToken(PERSON);
  const decoded = verifyToken(token);
  if (!decoded) { fail("a freshly minted token did not verify"); }
  else {
    const lifetime = decoded.exp - before;
    // A couple of seconds of slack for the test itself running.
    if (Math.abs(lifetime - SESSION_MAX_AGE_SECONDS) > 3) {
      fail(`a token minted just now expires in ${lifetime}s, expected ~${SESSION_MAX_AGE_SECONDS}s`);
    } else {
      ok(`a freshly minted token expires in ~${lifetime}s, matching the configured lifetime`);
    }
  }
}

console.log("\n=== expiry is enforced, not just recorded ===");
{
  // A token minted with a lifetime that has already elapsed.
  const alreadyExpired = createToken(PERSON, -1);
  if (verifyToken(alreadyExpired) !== null) {
    fail("a token past its own expiry still verified");
  } else {
    ok("a token past its expiry is rejected");
  }

  // One second of life left, still valid; the same token cannot be forged with
  // a longer exp by tampering with the payload, because that breaks the
  // signature.
  const stillLive = createToken(PERSON, 1);
  if (verifyToken(stillLive) === null) fail("a token with one second left was rejected too early");
  else ok("a token that has not yet expired still verifies");

  const [payload, sig] = stillLive.split(".");
  const tampered = `${payload.slice(0, -1)}x.${sig}`;
  if (verifyToken(tampered) !== null) fail("a tampered payload still verified");
  else ok("tampering with the payload invalidates the signature");
}

console.log(failures === 0 ? "\n  Session lifetime verified.\n" : `\n  ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);

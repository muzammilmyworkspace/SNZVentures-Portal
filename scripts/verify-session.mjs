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

import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_IDLE_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
} from "../lib/auth/constants.ts";
import { createToken, verifyToken } from "../lib/auth/token.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const PERSON = { userId: "u1", email: "a@test", role: "student", name: "A" };

console.log("\n=== the two clocks ===");
{
  const HOUR = 60 * 60;

  /*
    THE IDLE WINDOW is what a token is minted with, and what lapses when
    nothing refreshes it. An hour or more would mean a laptop left open in a
    shared office still holds a live session long after its owner has gone,
    which is the case this whole mechanism exists for.
  */
  if (SESSION_IDLE_SECONDS > HOUR) {
    fail(`the idle window is ${SESSION_IDLE_SECONDS}s - too long for a portal holding identity documents`);
  } else {
    ok(`a session lapses after ${SESSION_IDLE_SECONDS / 60} minutes with nobody there`);
  }

  if (SESSION_MAX_AGE_SECONDS !== SESSION_IDLE_SECONDS) {
    fail("tokens are not minted with the idle window, so refreshing cannot control the lifetime");
  } else {
    ok("a token is minted with the idle window");
  }

  /*
    THE CEILING has to be longer than the idle window or refreshing is
    pointless, and inside a day, or an always-open tab becomes a permanent
    session - the exact failure the absolute cap is here to stop.
  */
  if (SESSION_ABSOLUTE_SECONDS <= SESSION_IDLE_SECONDS) {
    fail("the absolute cap is not longer than the idle window, so a session can never be refreshed");
  } else if (SESSION_ABSOLUTE_SECONDS > 24 * HOUR) {
    fail(`the absolute cap is ${SESSION_ABSOLUTE_SECONDS / HOUR}h - an open tab would outlive the day it began in`);
  } else {
    ok(`no session outlives ${SESSION_ABSOLUTE_SECONDS / HOUR} hours, however active`);
  }
}

console.log("\n=== the ceiling cannot be pushed out ===");
{
  const first = verifyToken(createToken(PERSON));

  /*
    THE ONE THAT MATTERS. A refresh passes the existing `abs` back, and if
    createToken ever recalculated it instead of carrying it forward, every
    refresh would reset the cap and an open tab would stay signed in for ever
    - with every other test in this file still passing.
  */
  const refreshed = verifyToken(createToken({ ...PERSON, abs: first.abs }));
  if (refreshed.abs !== first.abs) {
    fail(`refreshing moved the absolute expiry from ${first.abs} to ${refreshed.abs}`);
  } else {
    ok("refreshing a session carries its ceiling forward unchanged");
  }

  // Past its ceiling but well inside its idle window: still refused.
  const past = createToken({ ...PERSON, abs: Math.floor(Date.now() / 1000) - 1 });
  if (verifyToken(past) !== null) {
    fail("a token past its absolute expiry still verified");
  } else {
    ok("a token past its ceiling is refused even with idle time left");
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

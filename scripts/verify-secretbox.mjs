/**
 * SEALING A CREDENTIAL, EXERCISED.
 *
 *   npm run verify:secretbox
 *
 * A refresh token to a Google Drive holding client passports is the highest
 * value string in this database. The failure that matters is not "encryption
 * is weak" — it is a seal/open pair that silently does nothing, or an open()
 * that throws and takes a page down when AUTH_SECRET is rotated.
 */
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "x".repeat(64);
const { seal, open } = await import("../lib/integrations/secret-box.ts");

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

console.log("\n=== secret box ===");

const secret = "1//0abcDEF-refresh-token_value.with~punctuation";
const sealed = seal(secret);

if (sealed.includes(secret)) fail("the plaintext is visible in the sealed value");
if (open(sealed) !== secret) fail("a sealed value does not open back to itself");
else ok("seals and opens round trip");

/* Two seals of the same text must differ, or a database dump shows which
   users share a credential. */
if (seal(secret) === seal(secret)) fail("sealing is deterministic — the IV is not random");
else ok("each seal is unique");

/* Tampering must be detected, not decrypted into something else. */
const parts = sealed.split(".");
const flipped = [parts[0], parts[1], parts[2].slice(0, -2) + (parts[2].endsWith("A") ? "BB" : "AA")].join(".");
if (open(flipped) !== null) fail("a tampered value opened");
else ok("tampering is rejected");

/* Rubbish in must not throw — it is reached on every page that reads the
   connection, and a rotated AUTH_SECRET is a normal event. */
for (const junk of ["", "x", "a.b", "a.b.c", "....", "not-base64!.$$.%%"]) {
  try {
    if (open(junk) !== null) fail(`"${junk}" opened into something`);
  } catch {
    fail(`"${junk}" threw instead of returning null`);
  }
}
ok("malformed input returns null rather than throwing");

/* The rotation case, exactly. The key is derived on every call rather than at
   import, so changing the variable is all it takes — which is also why a
   rotated deployment reads as "reconnect" rather than crashing. */
process.env.AUTH_SECRET = "y".repeat(64);
try {
  if (open(sealed) !== null) fail("a value opened under a different AUTH_SECRET");
  else ok("a rotated secret makes the old value unreadable, not fatal");
} catch {
  fail("rotation threw instead of returning null");
}
process.env.AUTH_SECRET = "x".repeat(64);
if (open(sealed) !== secret) fail("restoring the secret did not restore access");

console.log(failures === 0 ? "\n  Secret box verified.\n" : `\n  ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);

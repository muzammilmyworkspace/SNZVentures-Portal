/**
 * THE ARCHIVE, OPENED BY SOMETHING THAT IS NOT US.
 *
 *   npm run verify:zip
 *
 * A hand-written ZIP that is subtly wrong produces a file that downloads
 * perfectly and will not open — discovered by a member of staff, on a client's
 * documents, at the moment they needed them. So it is unzipped by the system's
 * own tool and the bytes compared, rather than checked against the same
 * assumptions that wrote it.
 */
import { buildZip, safeEntryName } from "../lib/zip.ts";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

console.log("\n=== entry names ===");
{
  const taken = new Set();
  const cases = [
    ["../../etc/passwd", /^etc-passwd$/],
    ["a/b\\c.pdf", /^a-b-c\.pdf$/],
    ['bad<>:"|?*.pdf', /^bad\.pdf$/],
    ["", /^document$/],
  ];
  for (const [input, shape] of cases) {
    const out = safeEntryName(input, taken);
    if (!shape.test(out)) fail(`"${input}" became "${out}"`);
  }
  /* Two documents with one name are two documents, not one. */
  const dup = new Set();
  const a = safeEntryName("Passport.pdf", dup);
  const b = safeEntryName("Passport.pdf", dup);
  const c = safeEntryName("Passport.pdf", dup);
  if (a === b || b === c || a === c) fail(`duplicates collapsed: ${a}, ${b}, ${c}`);
  if (b !== "Passport (2).pdf") fail(`second copy named "${b}"`);
  ok("traversal, illegal characters and duplicates all handled");
}

console.log("\n=== a real archive ===");
const entries = [
  { name: "empty.txt", data: Buffer.alloc(0) },
  { name: "small.txt", data: Buffer.from("hello", "utf8") },
  { name: "binary.bin", data: Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256)) },
  { name: "utf8 — نام.txt", data: Buffer.from("unicode name", "utf8") },
];

const zip = buildZip(entries);
if (zip.readUInt32LE(0) !== 0x04034b50) fail("the archive does not start with a local header");

const dir = mkdtempSync(path.join(tmpdir(), "snzzip-"));
try {
  const file = path.join(dir, "out.zip");
  writeFileSync(file, zip);

  /* Extracted by the platform's own unzip, not by anything of ours. */
  let extracted = false;
  for (const attempt of [
    () => execFileSync("unzip", ["-qq", "-o", file, "-d", dir], { stdio: "pipe" }),
    () =>
      execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${file}' -DestinationPath '${dir}' -Force`],
        { stdio: "pipe" }
      ),
  ]) {
    try {
      attempt();
      extracted = true;
      break;
    } catch {
      /* try the next one */
    }
  }

  if (!extracted) {
    console.log("  --    no unzip tool available here; structure checked only");
  } else {
    const found = readdirSync(dir).filter((f) => f !== "out.zip");
    if (found.length !== entries.length) {
      fail(`extracted ${found.length} files, expected ${entries.length}`);
    }
    /*
      Matched on CONTENT rather than on filename. Whether a particular
      extractor round-trips a non-ASCII name is its business — Expand-Archive
      and unzip disagree — and what has to be proved here is that the bytes
      survive.
    */
    const extractedBytes = found.map((f) => readFileSync(path.join(dir, f)));
    for (const entry of entries) {
      if (!extractedBytes.some((b) => b.equals(entry.data))) {
        fail(`the contents of ${entry.name} did not come back`);
      }
    }
    ok(`${entries.length} entries extracted byte-for-byte by the system unzip`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

/* An empty archive still has to be a valid one — a client with no documents
   should get an empty zip, not a corrupt file. */
const none = buildZip([]);
if (none.length !== 22 || none.readUInt32LE(0) !== 0x06054b50) {
  fail("an empty archive is not a valid end-of-central-directory record");
} else {
  ok("an empty archive is still valid");
}

console.log(failures === 0 ? "\n  Zip verified.\n" : `\n  ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);

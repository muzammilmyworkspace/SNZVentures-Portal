import { createHash } from "node:crypto";

/**
 * A MINIMAL ZIP WRITER.
 * ---------------------------------------------------------------------------
 * Staff were downloading a client's documents one at a time, which for a file
 * with eleven of them is eleven clicks, eleven Save dialogs and eleven chances
 * to lose track of which is which.
 *
 * WRITTEN RATHER THAN INSTALLED, for one reason: everything in these archives
 * is a PDF or a JPEG, and both are already compressed. Deflate would spend CPU
 * to make them fractionally larger, so the STORE method is not a compromise
 * here — it is the right choice, and it is about sixty lines. A dependency
 * would have brought a compressor we would immediately turn off.
 *
 * The format is the original PKZIP one: a local header before each file, a
 * central directory listing them all, and an end-of-central-directory record
 * pointing at it. No ZIP64, so this is not the tool for archives over 4 GB or
 * with more than 65,535 entries — neither of which a client file approaches,
 * and the caller caps the size anyway.
 */

/* CRC-32, table built once. Every entry needs one and the format has no way
   to say "unknown", so it cannot be skipped. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time, which is what the format stores. */
function dosStamp(d = new Date()): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ZipEntry = { name: string; data: Buffer };

/**
 * Names inside the archive.
 *
 * Slashes would create folders and `..` would escape them, so both go. Windows
 * additionally refuses < > : " | ? * in a filename, and an archive that cannot
 * be extracted on the machine it was downloaded to is not much of an archive.
 * Duplicates are numbered rather than overwritten — two documents called
 * "Passport.pdf" are two documents.
 */
export function safeEntryName(raw: string, taken: Set<string>): string {
  const cleaned =
    raw
      .replace(/[\\/]/g, "-")
      .replace(/[<>:"|?*\x00-\x1f]/g, "")
      /*
        RUNS OF DOTS, not just leading ones. Separators are replaced first,
        so "../../etc/passwd" becomes "..-..-etc-passwd" — which still
        carries the traversal. Stripping only the LEADING dots left
        "-..-etc-passwd" and looked fixed, which is the worst kind of wrong
        for a rule whose whole job is to make a name safe.
      */
      .replace(/\.{2,}/g, "")
      .replace(/^[.\-\s]+/, "")
      .trim()
      .slice(0, 150) || "document";

  if (!taken.has(cleaned)) {
    taken.add(cleaned);
    return cleaned;
  }

  const dot = cleaned.lastIndexOf(".");
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const { time, date } = dosStamp();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    // Bit 11: the name is UTF-8. Without it, anything non-ASCII is mojibake
    // on extraction, and client names here are routinely non-ASCII.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); // stored, not deflated
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // where its local header starts

    centrals.push(central, name);
    offset += local.length + name.length + size;
  }

  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, central, end]);
}

/** Only used by the test, to prove entries survive a round trip. */
export const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 12);

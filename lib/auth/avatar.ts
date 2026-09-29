import "server-only";

/**
 * A profile photo arrives as a data URI, not a file.
 *
 * Both places one is chosen happen before a session exists, so there is
 * nothing to authenticate an upload with — see AvatarPicker for why the
 * browser resizes it instead. That makes this the boundary: a string posted by
 * anybody, about to be stored on a user row and later rendered in an <img>.
 *
 * WHAT IS CHECKED, and why each one matters:
 *
 *  • The declared type. `data:` URIs can carry anything, including
 *    `image/svg+xml` — which browsers execute. An SVG avatar is a script
 *    running wherever that photo is displayed, which is every page showing
 *    that person's name.
 *
 *  • The size. The picker produces about 20KB; anything far larger did not
 *    come from it, and an unbounded string on a column read by every page is
 *    a slow page for everybody.
 *
 *  • That the base64 actually decodes, and that its first bytes are the file
 *    type it claims. A declared type is a claim by the sender; the magic
 *    number is the file itself.
 */

/** Generous against the picker's ~20KB, tight against anything else. */
const MAX_BYTES = 400 * 1024;

const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  // RIFF....WEBP — the first four bytes are enough to tell it from the others.
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

/**
 * Returns the data URI when it is a real, small raster image, and null for
 * anything else — including a value that is simply absent.
 *
 * Null rather than throwing: a photo is optional everywhere it is asked for,
 * and refusing to create somebody's account over a bad avatar would trade a
 * missing picture for a missing account.
 */
export function safeAvatar(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value.trim());
  if (!match) return null;

  const [, mime, b64] = match;

  // Rough byte count before decoding, so an enormous string is rejected
  // without being materialised first.
  if (Math.floor((b64.length * 3) / 4) > MAX_BYTES) return null;

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_BYTES) return null;

  const sig = SIGNATURES.find((s) => s.mime === mime);
  if (!sig) return null;
  if (buf.length < sig.bytes.length) return null;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buf[i] !== sig.bytes[i]) return null;
  }

  return value.trim();
}

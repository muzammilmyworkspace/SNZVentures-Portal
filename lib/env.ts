/**
 * READING ENVIRONMENT VARIABLES THE WAY THEY ACTUALLY ARRIVE.
 * ---------------------------------------------------------------------------
 * A dashboard lets you save a variable with nothing in it, and several here
 * were saved exactly that way. To `??` an empty string is a value, so
 *
 *     process.env.SUPABASE_DOCUMENTS_BUCKET ?? "client-documents"
 *
 * yielded "" — and the bucket name in every storage URL was blank. Supabase
 * answered "Bucket not found", which sounds like a bucket that was deleted
 * and is really a bucket that was never named. That cost an afternoon.
 *
 * A variable set to "" is not configured. Neither is one set to whitespace,
 * which is what a stray copy-paste leaves behind. Read them through here.
 */

/** Trimmed value, or undefined when unset, empty or whitespace. */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Trimmed value, or the fallback when unset, empty or whitespace. */
export function envOr(name: string, fallback: string): string {
  return env(name) ?? fallback;
}

/** True when the variable holds something. */
export function envSet(name: string): boolean {
  return env(name) !== undefined;
}

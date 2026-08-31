/**
 * TELLING A BROKEN DEPLOYMENT APART FROM A BAD MOMENT.
 * ---------------------------------------------------------------------------
 * These two failures look identical from inside a catch block and could not be
 * more different to the person holding them:
 *
 *   • a transient fault — a dropped connection, a timeout. Retrying works.
 *   • a configuration fault — a table that was never created, a credential
 *     that is not a credential. Retrying works never, no matter how many times.
 *
 * Answering both with "please try again" is how a student sat pressing a
 * button against a missing table, and how nobody who could fix it found out.
 * A configuration fault should say so, stop asking for a retry, and point at
 * the page where it can actually be dealt with.
 */

export type FaultKind = "config" | "transient";

export type Fault = {
  kind: FaultKind;
  /** Shown to the person who hit it. Never contains internals. */
  message: string;
  /** Logged, and shown to staff on the health page. */
  detail: string;
  status: number;
};

const CONTACT = "info@snzventures.com";

/** Postgres SQLSTATEs that mean "the schema is not what this code expects". */
const SCHEMA_CODES = new Set([
  "42P01", // undefined_table
  "42703", // undefined_column
  "42883", // undefined_function
  "3F000", // invalid_schema_name
  "42704", // undefined_object (a missing enum type)
]);

export function classifyFault(error: unknown): Fault {
  const detail = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (SCHEMA_CODES.has(code)) {
    return {
      kind: "config",
      status: 503,
      detail: `schema: ${detail}`,
      message:
        "This part of the portal is not switched on yet — a database update is " +
        `still pending. Nothing you did caused this. Please email ${CONTACT} and ` +
        "we will sort it out.",
    };
  }

  /*
    Storage credential faults. Supabase answers a malformed service-role key
    with "Invalid Compact JWS"; the others answer with a plain 401/403. None of
    them will start working because somebody pressed the button again.
  */
  if (
    /Invalid Compact JWS|AccessDenied|Unauthorized|upload failed: 40[13]|sign failed: 40[13]|NoSuchBucket|Bucket not found|bucket unavailable/i.test(
      detail
    )
  ) {
    return {
      kind: "config",
      status: 503,
      detail: `storage: ${detail}`,
      message:
        "We could not file your upload — our document storage is not set up " +
        `correctly. This is on us, not you. Please email your receipt to ${CONTACT} ` +
        "and we will attach it by hand.",
    };
  }

  return {
    kind: "transient",
    status: 500,
    detail,
    message:
      "We couldn't record that just now. Please try again, or send your " +
      `receipt to ${CONTACT}.`,
  };
}

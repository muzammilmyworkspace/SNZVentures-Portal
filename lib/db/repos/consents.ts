import { db, safeQuery, isDatabaseConfigured } from "../client";

export type ConsentRecord = {
  id: string;
  kind: string;
  version: string;
  signedName: string;
  acceptedAt: string;
  ip: string | null;
};

/**
 * Records an acceptance.
 *
 * The VERSION is stored alongside, because a consent that only records "they
 * agreed" against wording that has since been revised proves nothing about
 * what was agreed to. The typed name is the signature the paper form asks for,
 * and the address is what turns the row from an assertion into evidence.
 *
 * NOTHING SENSITIVE IS DERIVED FROM THE REQUEST BODY except the name the
 * person typed. The version comes from the server's own constant, so a browser
 * cannot claim to have accepted a different — or older — document than the one
 * it was shown.
 *
 * Re-accepting the same version is not a second agreement, so the insert is a
 * no-op in that case rather than an error; a duplicate row would only make the
 * history harder to read.
 */
export async function recordConsent(input: {
  userId: string;
  kind?: string;
  version: string;
  signedName: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  return safeQuery(async () => {
    await db()`
      INSERT INTO consents (user_id, kind, version, signed_name, ip, user_agent)
      VALUES (
        ${input.userId},
        ${input.kind ?? "student_undertaking"},
        ${input.version},
        ${input.signedName.slice(0, 160)},
        ${input.ip ?? null},
        ${(input.userAgent ?? "").slice(0, 300) || null}
      )
      ON CONFLICT (user_id, kind, version) DO NOTHING
    `;
    return true;
  }, false);
}

/** Everything this person has agreed to, newest first. Staff-facing. */
export async function consentsFor(userId: string): Promise<ConsentRecord[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => {
    const rows = await db()`
      SELECT id, kind, version, signed_name, accepted_at, ip
      FROM consents WHERE user_id = ${userId}
      ORDER BY accepted_at DESC
    `;
    return rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind),
      version: String(r.version),
      signedName: String(r.signed_name),
      acceptedAt: new Date(r.accepted_at as string).toISOString(),
      ip: r.ip ? String(r.ip) : null,
    }));
  }, []);
}

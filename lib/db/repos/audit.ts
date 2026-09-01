import { db, safeQuery } from "../client";

/**
 * AUDIT LOG — append-only.
 *
 * NEVER pass credentials, tokens, password hashes or secrets in `meta`.
 * The helper strips a denylist of keys as a backstop, but the rule is enforced
 * at the call site: log identifiers and outcomes, not payloads.
 */

const FORBIDDEN = /(password|secret|token|api[_-]?key|authorization|cookie|hash)/i;

function scrub(meta?: Record<string, unknown>): Record<string, unknown> | null {
  if (!meta) return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN.test(k)) continue;
    if (typeof v === "string" && v.length > 500) continue;
    clean[k] = v;
  }
  return Object.keys(clean).length ? clean : null;
}

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.register"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "auth.email_verified"
  | "user.role_changed"
  | "user.suspended"
  | "user.activated"
  | "user.password_reset_link"
  | "user.deleted"
  | "case.created"
  | "case.status_changed"
  | "case.advisor_assigned"
  | "document.uploaded"
  | "document.reviewed"
  | "document.deleted"
  | "document.downloaded"
  | "staff.assigned"
  | "staff.unassigned"
  // Schema applied from the admin area (009). A migration changes the shape
  // of every table under it and cannot be undone from the UI, so both the
  // successful runs and the refused ones are recorded with who pressed it.
  | "schema.applied"
  | "schema.failed"
  // Google Drive (012). Exporting a client file copies passports and bank
  // statements out of private storage, and sharing sends them to somebody
  // outside the portal entirely — both are recorded with who and to whom.
  | "drive.connected"
  | "drive.disconnected"
  | "drive.exported"
  /*
    Viewing the portal as a client. Both ends are recorded, with the member of
    staff named: a view-as that is not attributable is not a support tool, it
    is a way to act as somebody else without a trace.
  */
  | "user.impersonation_started"
  | "user.impersonation_ended"
  /*
    Moving the address an account signs in with. All three are recorded,
    including the refusal: repeated failures against the current password are
    what somebody probing a hijacked session looks like.
  */
  | "user.email_change_requested"
  | "user.email_change_refused"
  | "user.email_changed"
  // Fee verification (007). The student declares, staff decide, and the
  // decision is what unlocks the rest of the portal — so all three are
  // recorded, not just the approval.
  | "fee.submitted"
  | "fee.verified"
  | "fee.rejected"
  // The student taking back a receipt we had not looked at yet. Recorded
  // because three attempts should be visible as three, not as one.
  | "fee.withdrawn"
  // Operational layer (003)
  | "message.sent"
  | "intake.submitted"
  | "intake.status_changed"
  | "note.added"
  | "note.deleted"
  // Student consent (005). The entry records THAT an undertaking was accepted
  // and which version; the consents table holds the signature and address.
  | "consent.accepted"
  | "task.status_changed"
  | "appointment.requested"
  | "admin.action";

export async function audit(entry: {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}) {
  // Never let an audit write break the operation it is recording.
  await safeQuery(async () => {
    await db()`
      INSERT INTO audit_logs (actor_id, actor_email, action, entity, entity_id, meta, ip)
      VALUES (${entry.actorId ?? null}, ${entry.actorEmail ?? null}, ${entry.action},
              ${entry.entity ?? null}, ${entry.entityId ?? null},
              ${scrub(entry.meta) as never}, ${entry.ip ?? null})
    `;
    return true;
  }, false);
}

export type AuditRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export async function listAudit(limit = 100, action?: string): Promise<AuditRow[]> {
  return safeQuery(async () => {
    const rows = await db()`
      SELECT * FROM audit_logs
      WHERE (${action ?? null}::text IS NULL OR action = ${action ?? null})
      ORDER BY created_at DESC LIMIT ${Math.min(limit, 500)}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      actorEmail: r.actor_email ? String(r.actor_email) : null,
      action: String(r.action),
      entity: r.entity ? String(r.entity) : null,
      entityId: r.entity_id ? String(r.entity_id) : null,
      meta: (r.meta as Record<string, unknown>) ?? null,
      ip: r.ip ? String(r.ip) : null,
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  }, []);
}

import { db, safeQuery, isDatabaseConfigured } from "../client";

/**
 * CONSULTATIONS — a meeting with SnZ Ventures, asked for by a student or a
 * consultant and given a time by the team.
 *
 *   requested  → the requester has asked (topic, how, when suits them)
 *   confirmed  → staff set the day, time, length and link or place
 *   completed / cancelled
 *
 * Rows live in `appointments` (001), with the columns added in 031.
 * `client_id` is the requester, whoever they are.
 */

export type Consultation = {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
  topic: string;
  mode: "video" | "phone" | "office" | null;
  preferred: string | null;
  notes: string | null;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  startsAt: string | null;
  durationMinutes: number;
  meetingLink: string | null;
  staffNote: string | null;
  scheduledByName: string | null;
  createdAt: string;
};

const map = (r: Record<string, unknown>): Consultation => ({
  id: String(r.id),
  requesterId: String(r.client_id),
  requesterName: String(r.requester_name ?? ""),
  requesterEmail: String(r.requester_email ?? ""),
  requesterRole: String(r.requester_role ?? ""),
  topic: String(r.topic ?? r.type ?? "Consultation"),
  mode: (r.mode as Consultation["mode"]) ?? null,
  preferred: r.preferred ? String(r.preferred) : null,
  notes: r.notes ? String(r.notes) : null,
  status: r.status as Consultation["status"],
  startsAt: r.starts_at ? new Date(String(r.starts_at)).toISOString() : null,
  durationMinutes: Number(r.duration_minutes ?? 30),
  meetingLink: r.meeting_link ? String(r.meeting_link) : null,
  staffNote: r.staff_note ? String(r.staff_note) : null,
  scheduledByName: r.scheduled_by_name ? String(r.scheduled_by_name) : null,
  createdAt: new Date(String(r.created_at)).toISOString(),
});

const SELECT = (where: ReturnType<ReturnType<typeof db>>) => db()`
  SELECT a.*, u.name AS requester_name, u.email AS requester_email, u.role::text AS requester_role,
         s.name AS scheduled_by_name
    FROM appointments a
    JOIN users u ON u.id = a.client_id
    LEFT JOIN users s ON s.id = a.scheduled_by
   ${where}
   ORDER BY COALESCE(a.starts_at, a.created_at) DESC
   LIMIT 300
`;

/** The consultations one person has asked for. */
export async function consultationsFor(userId: string): Promise<Consultation[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => (await SELECT(db()`WHERE a.client_id = ${userId}`)).map(map), []);
}

/** Every consultation, for the team. */
export async function allConsultations(): Promise<Consultation[]> {
  if (!isDatabaseConfigured()) return [];
  return safeQuery(async () => (await SELECT(db()``)).map(map), []);
}

export async function getConsultation(id: string): Promise<Consultation | null> {
  return safeQuery(async () => {
    const rows = await SELECT(db()`WHERE a.id = ${id}`);
    return rows[0] ? map(rows[0]) : null;
  }, null);
}

export async function requestConsultation(input: {
  requesterId: string;
  topic: string;
  mode: "video" | "phone" | "office";
  preferred: string | null;
  notes: string | null;
}): Promise<string | null> {
  return safeQuery(async () => {
    const [row] = await db()`
      INSERT INTO appointments (client_id, type, topic, mode, preferred, notes, status)
      VALUES (${input.requesterId}, 'consultation', ${input.topic}, ${input.mode},
              ${input.preferred}, ${input.notes}, 'requested')
      RETURNING id
    `;
    return row ? String(row.id) : null;
  }, null);
}

/** Staff give it a time (or move it). Works on requested and confirmed ones. */
export async function scheduleConsultation(input: {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  mode: "video" | "phone" | "office";
  meetingLink: string | null;
  staffNote: string | null;
  staffId: string;
}): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE appointments
         SET status = 'confirmed', starts_at = ${input.startsAt}, duration_minutes = ${input.durationMinutes},
             mode = ${input.mode}, meeting_link = ${input.meetingLink}, staff_note = ${input.staffNote},
             scheduled_by = ${input.staffId}, advisor_id = COALESCE(advisor_id, ${input.staffId}),
             updated_at = now()
       WHERE id = ${input.id} AND status IN ('requested', 'confirmed')
      RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

export async function closeConsultation(
  id: string,
  status: "completed" | "cancelled",
  note: string | null
): Promise<boolean> {
  return safeQuery(async () => {
    const rows = await db()`
      UPDATE appointments
         SET status = ${status}::appointment_status,
             staff_note = COALESCE(${note}, staff_note), updated_at = now()
       WHERE id = ${id} AND status IN ('requested', 'confirmed')
      RETURNING id
    `;
    return rows.length > 0;
  }, false);
}

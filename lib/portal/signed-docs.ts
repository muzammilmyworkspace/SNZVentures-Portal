import "server-only";
import { db, safeQuery, isDatabaseConfigured } from "@/lib/db/client";
import { listTemplates, templateVersion } from "@/lib/db/repos/consent-templates";
import { refreshToken, connectionStatus, saveRootFolder, recordMirror } from "@/lib/db/repos/drive";
import { accessTokenFrom, ensureFolder, putFile, ROOT_FOLDER_NAME } from "@/lib/integrations/drive";
import { studentFolderName } from "@/lib/integrations/drive-mirror";
import { getSignedUrl } from "@/lib/storage";
import { CONSENT_CLAUSES, CONSENT_CLOSING, CONSENT_PARTY, CONSENT_TITLE, consentRuns } from "./consent";
import { memberId } from "./member-id";
import { paymentTermsOf } from "./payment-terms";
import { buildSignedPdf, type DocContent, type Run } from "./signed-pdf";

/*
 * SIGNED DOCUMENTS (migration 049): every student consent and every
 * acceptance of the payment terms gets a PDF made from the exact version the
 * student was shown, plus a signature certificate. It is stored here, listed
 * under Forms → Consent forms, downloadable, and copied to the student's own
 * folder in Google Drive. Signatures made before this existed get their PDF
 * the first time somebody opens it.
 */

export type SignedKind = "student_undertaking" | "payment_terms";

export const KIND_TITLE: Record<SignedKind, string> = {
  student_undertaking: CONSENT_TITLE,
  payment_terms: "Payment Terms",
};

const paragraphs = (body: string): Run[][] =>
  body
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => [{ text: p, strong: false }]);

/** The words (or the uploaded file) of one exact version. */
export async function contentFor(kind: SignedKind, version: string): Promise<DocContent> {
  if (kind === "payment_terms") {
    const t = await paymentTermsOf(version);
    return {
      title: t.title,
      party: CONSENT_PARTY,
      version,
      clauses: t.lines.map((l) => [{ text: l, strong: false }]),
      closing: "By ticking the box, the student confirmed that they had read and accepted these terms before choosing a payment plan.",
    };
  }
  if (version.startsWith("custom-")) {
    const t = (await listTemplates("student", null)).find((x) => templateVersion(x) === version);
    if (t) {
      let originalPdf: Uint8Array | null = null;
      if (t.fileKey && (t.fileType === "application/pdf" || t.fileName?.toLowerCase().endsWith(".pdf"))) {
        try {
          const url = await getSignedUrl(t.fileKey, 300, t.fileProvider as never);
          const res = url ? await fetch(url, { cache: "no-store" }) : null;
          if (res?.ok) originalPdf = new Uint8Array(await res.arrayBuffer());
        } catch {
          originalPdf = null;
        }
      }
      return {
        title: t.title,
        party: CONSENT_PARTY,
        version,
        clauses: t.body ? paragraphs(t.body) : [[{ text: `The document agreed to is the attached file "${t.fileName ?? "consent"}" (version ${version}).`, strong: false }]],
        closing: CONSENT_CLOSING,
        originalPdf,
      };
    }
  }
  // The built-in wording.
  return {
    title: CONSENT_TITLE,
    party: CONSENT_PARTY,
    version,
    clauses: CONSENT_CLAUSES.map((c) => consentRuns(c)),
    closing: CONSENT_CLOSING,
  };
}

type Acceptance = {
  userId: string;
  name: string;
  email: string;
  studentId: string;
  version: string;
  signedName: string;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
};

/** The acceptance itself, as recorded when it happened. Latest version unless one is named. */
async function acceptanceOf(kind: SignedKind, userId: string, version?: string): Promise<Acceptance | null> {
  return safeQuery(async () => {
    const rows =
      kind === "student_undertaking"
        ? await db()`
            SELECT c.version, c.signed_name, c.accepted_at AS at, c.ip, c.user_agent, u.name, u.email, u.role::text AS role, u.member_no
              FROM consents c JOIN users u ON u.id = c.user_id
             WHERE c.user_id = ${userId} AND c.kind = 'student_undertaking'
               ${version ? db()`AND c.version = ${version}` : db()``}
             ORDER BY c.accepted_at DESC LIMIT 1`
        : await db()`
            SELECT p.terms_version AS version, u.name AS signed_name, p.terms_accepted_at AS at, p.ip, p.user_agent, u.name, u.email, u.role::text AS role, u.member_no
              FROM payment_plans p JOIN users u ON u.id = p.user_id
             WHERE p.user_id = ${userId}
               ${version ? db()`AND p.terms_version = ${version}` : db()``}
             LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return {
      userId,
      name: String(r.name),
      email: String(r.email),
      studentId: memberId(String(r.role), r.member_no == null ? null : Number(r.member_no)),
      version: String(r.version),
      signedName: String(r.signed_name),
      signedAt: new Date(String(r.at)),
      ip: r.ip ? String(r.ip) : null,
      userAgent: r.user_agent ? String(r.user_agent) : null,
    };
  }, null);
}

/**
 * The stored signed PDF for this acceptance, made now if it does not exist
 * yet. Returns its id, or null when there is no such acceptance.
 */
export async function ensureSignedDoc(kind: SignedKind, userId: string, version?: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const a = await acceptanceOf(kind, userId, version);
  if (!a) return null;
  const existing = await safeQuery(async () => {
    const [r] = await db()`SELECT id FROM signed_documents WHERE user_id = ${userId} AND kind = ${kind} AND version = ${a.version}`;
    return r ? String(r.id) : null;
  }, null);
  if (existing) return existing;

  const content = await contentFor(kind, a.version);
  const { pdf, sha256 } = await buildSignedPdf(content, {
    name: a.name,
    studentId: a.studentId,
    email: a.email,
    signedName: a.signedName,
    signedAt: a.signedAt,
    ip: a.ip,
    userAgent: a.userAgent,
    how: kind === "payment_terms" ? "Accepted by ticking the box before choosing a payment plan" : "Signed by typing their full name and ticking the box, at the end of the application",
  });
  return safeQuery(async () => {
    const [r] = await db()`
      INSERT INTO signed_documents (user_id, kind, version, signed_name, signed_at, ip, user_agent, sha256, pdf)
      VALUES (${userId}, ${kind}, ${a.version}, ${a.signedName}, ${a.signedAt}, ${a.ip}, ${a.userAgent}, ${sha256}, ${Buffer.from(pdf)})
      ON CONFLICT (user_id, kind, version) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id`;
    return r ? String(r.id) : null;
  }, null);
}

export async function signedDoc(id: string) {
  return safeQuery(async () => {
    const [r] = await db()`
      SELECT d.id, d.user_id, d.kind, d.version, d.signed_at, d.pdf, u.name, u.email, u.role::text AS role, u.member_no
        FROM signed_documents d JOIN users u ON u.id = d.user_id WHERE d.id = ${id}`;
    if (!r) return null;
    return {
      id: String(r.id),
      userId: String(r.user_id),
      kind: String(r.kind) as SignedKind,
      version: String(r.version),
      signedAt: new Date(String(r.signed_at)),
      pdf: Buffer.from(r.pdf as Uint8Array),
      name: String(r.name),
      email: String(r.email),
      studentId: memberId(String(r.role), r.member_no == null ? null : Number(r.member_no)),
    };
  }, null);
}

export function signedFileName(d: { kind: SignedKind; version: string; studentId: string; signedAt: Date }) {
  const day = d.signedAt.toISOString().slice(0, 10);
  return `${d.studentId} - ${KIND_TITLE[d.kind]} (signed ${day}, ${d.version}).pdf`.replace(/[\\/:*?"<>|]/g, "-");
}

/** Copies one signed document to the student's folder in Google Drive. Never throws. */
export async function copySignedToDrive(id: string): Promise<boolean> {
  try {
    const d = await signedDoc(id);
    if (!d) return false;
    const stored = await refreshToken();
    if (!stored) return false;
    const token = await accessTokenFrom(stored);
    if (!token) return false;
    let rootId = (await connectionStatus()).rootFolderId;
    if (!rootId) {
      const root = await ensureFolder(token, ROOT_FOLDER_NAME);
      if (!root) return false;
      rootId = root.id;
      await saveRootFolder(rootId);
    }
    const folder = await ensureFolder(token, studentFolderName(d.name, d.email), rootId);
    if (!folder) return false;
    const signedFolder = await ensureFolder(token, "Signed consents", folder.id);
    if (!signedFolder) return false;
    if (!(await putFile(token, signedFolder.id, signedFileName(d), d.pdf, "application/pdf"))) return false;
    await recordMirror(d.userId, folder.id, folder.url);
    await db()`UPDATE signed_documents SET drive_synced_at = now() WHERE id = ${id}`;
    return true;
  } catch (e) {
    console.error("[signed-docs] Drive copy failed:", e);
    return false;
  }
}

/** Right after somebody signs or accepts: make the PDF and copy it to Drive. Never throws. */
export async function recordSigned(kind: SignedKind, userId: string): Promise<void> {
  try {
    const id = await ensureSignedDoc(kind, userId);
    if (id) await copySignedToDrive(id);
  } catch (e) {
    console.error("[signed-docs] could not record:", e);
  }
}

/** Everybody who signed (or accepted) one kind, newest first, with their PDF if made. */
export async function signersOf(kind: SignedKind) {
  return safeQuery(async () => {
    const rows =
      kind === "student_undertaking"
        ? await db()`
            SELECT c.user_id, c.version, c.signed_name, c.accepted_at AS at, c.ip, u.name, u.email, u.role::text AS role, u.member_no,
                   d.id AS doc_id, d.drive_synced_at
              FROM consents c JOIN users u ON u.id = c.user_id
              LEFT JOIN signed_documents d ON d.user_id = c.user_id AND d.kind = 'student_undertaking' AND d.version = c.version
             WHERE c.kind = 'student_undertaking'
             ORDER BY c.accepted_at DESC LIMIT 500`
        : await db()`
            SELECT p.user_id, p.terms_version AS version, u.name AS signed_name, p.terms_accepted_at AS at, p.ip, u.name, u.email, u.role::text AS role, u.member_no,
                   d.id AS doc_id, d.drive_synced_at
              FROM payment_plans p JOIN users u ON u.id = p.user_id
              LEFT JOIN signed_documents d ON d.user_id = p.user_id AND d.kind = 'payment_terms' AND d.version = p.terms_version
             ORDER BY p.terms_accepted_at DESC LIMIT 500`;
    return rows.map((r) => ({
      userId: String(r.user_id),
      name: String(r.name),
      email: String(r.email),
      studentId: memberId(String(r.role), r.member_no == null ? null : Number(r.member_no)),
      version: String(r.version),
      signedName: String(r.signed_name),
      signedAt: new Date(String(r.at)).toISOString(),
      ip: r.ip ? String(r.ip) : null,
      docId: r.doc_id ? String(r.doc_id) : null,
      inDrive: !!r.drive_synced_at,
    }));
  }, [] as never[]);
}

export type Signer = Awaited<ReturnType<typeof signersOf>>[number];

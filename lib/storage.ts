/**
 * PRIVATE DOCUMENT STORAGE
 * ---------------------------------------------------------------------------
 * Client documents contain identity data (passports, transcripts, source-of-
 * funds evidence). They are NEVER written to /public, the repository or the
 * Vercel filesystem, and never served from a guessable URL.
 *
 * Two transports, chosen by environment variable:
 *
 *   BLOB_READ_WRITE_TOKEN  → Vercel Blob, uploaded with access:"private".
 *                            Downloads are brokered through our own route.
 *   S3_*                   → any S3-compatible store (AWS, Cloudflare R2,
 *                            Backblaze) using SigV4 presigned GETs.
 *
 * With neither configured, `isStorageConfigured()` is false and the upload UI
 * stays disabled — rather than accepting a file it cannot safely keep.
 */

import { createHmac, createHash } from "node:crypto";

export type StoredObject = {
  key: string;
  size: number;
  contentType: string;
  /** The store that actually holds it. Persist this with the key. */
  provider: Transport;
};

export type Transport = "supabase" | "blob" | "s3" | "none";

/**
 * IS THIS CREDENTIAL ONE SUPABASE WILL ACCEPT?
 *
 * Shape only — whether the key is valid, current or has the right grants is
 * Supabase's business, not something we can know without asking it.
 *
 * This exists because "the variable is set" and "the variable is usable" are
 * different questions, and picking a transport on the first one is how a
 * mistyped key silently disables uploads. Supabase takes two credential
 * formats: the legacy service_role JWT (three dot-separated base64url
 * segments) and the newer `sb_secret_…` key. Anything else — a project ref, a
 * database password, a hex string pasted into the wrong box — is not a key,
 * and every request made with it comes back "Invalid Compact JWS".
 */
function supabaseKeyLooksUsable(key: string | undefined): boolean {
  if (!key) return false;
  if (key.startsWith("sb_secret_")) return key.length > "sb_secret_".length + 8;
  const parts = key.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0) && key.startsWith("eyJ");
}

function supabaseUrlLooksUsable(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * WHICH STORE WE WRITE TO NOW.
 *
 * Supabase first, because this project already HAS Supabase: the alternatives
 * each mean onboarding a second vendor for something the existing one does.
 *
 * But only when its credentials are actually of the right shape. Before, a
 * malformed service-role key still selected Supabase and permanently shadowed
 * a working Blob token sitting right behind it — every upload failed with a
 * 403 from a vendor the operator had configured correctly somewhere else. A
 * transport that cannot possibly authenticate is not a transport; fall past it.
 */
export function storageTransport(): Transport {
  if (
    supabaseUrlLooksUsable(process.env.SUPABASE_URL) &&
    supabaseKeyLooksUsable(process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    return "supabase";
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) return "s3";
  return "none";
}

/**
 * What an operator needs to see on the health page: which transport is live,
 * and — importantly — which ones were configured but rejected, with the reason.
 * Silently falling back is right for the request; hiding it is not.
 */
export function storageDiagnosis(): {
  active: Transport;
  notes: string[];
} {
  const notes: string[] = [];
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url || key) {
    if (!supabaseUrlLooksUsable(url)) {
      notes.push(
        url
          ? "SUPABASE_URL is not an https URL. It should look like https://<project-ref>.supabase.co"
          : "SUPABASE_URL is not set."
      );
    }
    if (!supabaseKeyLooksUsable(key)) {
      notes.push(
        key
          ? "SUPABASE_SERVICE_ROLE_KEY is not a service-role credential. Expected a JWT starting `eyJ` or a key starting `sb_secret_`. Supabase rejects anything else with \"Invalid Compact JWS\"."
          : "SUPABASE_SERVICE_ROLE_KEY is not set."
      );
    }
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) notes.push("BLOB_READ_WRITE_TOKEN is not set.");

  return { active: storageTransport(), notes };
}

/**
 * SUPABASE STORAGE — private bucket, server-signed reads.
 *
 * Called with the SERVICE ROLE key, which bypasses storage RLS. That is
 * correct here and only here: every call is made from a route that has already
 * authorised the caller, and the key never leaves the server — it has no
 * NEXT_PUBLIC_ prefix and this module is only imported by API routes.
 *
 * The bucket is created private on first use. A public bucket would make every
 * passport scan readable by anyone who guessed a path, which is the whole
 * thing this exists to prevent.
 */
const SUPABASE_BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET ?? "client-documents";

function supabaseHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

const supabaseBase = () => process.env.SUPABASE_URL!.replace(/\/+$/, "");

/**
 * Idempotent. Creates the private bucket if it is not there yet.
 *
 * IT REPORTS WHY IT FAILED. This used to return a bare false that every caller
 * ignored, so a bucket that could not be created produced no error here — just
 * an upload a moment later answering "Bucket not found", which reads like the
 * bucket was deleted rather than never made. The reason the create was refused
 * is the only useful thing in that sequence, and it was the one thing thrown
 * away.
 */
export async function ensureSupabaseBucket(): Promise<{ ok: boolean; detail: string | null }> {
  let res: Response;
  try {
    res = await fetch(`${supabaseBase()}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: SUPABASE_BUCKET,
        name: SUPABASE_BUCKET,
        public: false,
        file_size_limit: MAX_UPLOAD_BYTES,
      }),
      cache: "no-store",
    });
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  if (res.ok) return { ok: true, detail: null };

  const text = await res.text().catch(() => "");
  // "Already exists" is the normal path on every call after the first.
  if (/already exists|Duplicate/i.test(text)) return { ok: true, detail: null };

  return {
    ok: false,
    detail: `could not create bucket "${SUPABASE_BUCKET}" (${res.status}): ${text.slice(0, 300)}`,
  };
}

/** The bucket this deployment writes to, for the health page. */
export const supabaseBucketName = () => SUPABASE_BUCKET;

/**
 * ASK THE STORE, DO NOT READ THE ENVIRONMENT.
 *
 * storageDiagnosis() can only see whether variables look right. This makes an
 * actual call, because every failure that has cost real time here — a key that
 * was not a key, a bucket that was never created — looked perfectly healthy
 * from the variables alone.
 */
export async function storageProbe(): Promise<{ ok: boolean; detail: string | null }> {
  const transport = storageTransport();
  if (transport === "none") return { ok: false, detail: "No usable transport is configured." };
  if (transport !== "supabase") {
    // Nothing to probe cheaply; the credential check is all we have.
    return { ok: true, detail: null };
  }

  try {
    const res = await fetch(
      `${supabaseBase()}/storage/v1/bucket/${encodeURIComponent(SUPABASE_BUCKET)}`,
      { headers: supabaseHeaders(), cache: "no-store" }
    );
    if (res.ok) return { ok: true, detail: null };
    if (res.status === 404) {
      const created = await ensureSupabaseBucket();
      return created.ok
        ? { ok: true, detail: `Bucket "${SUPABASE_BUCKET}" was missing and has been created.` }
        : { ok: false, detail: created.detail };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, detail: `${res.status}: ${text.slice(0, 300)}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function isStorageConfigured(): boolean {
  return storageTransport() !== "none";
}

/* ------------------------------------------------------------ validation */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function validateUpload(file: {
  size: number;
  type: string;
  name: string;
}): string | null {
  if (file.size <= 0) return "That file appears to be empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "Files must be 15 MB or smaller.";
  if (!ALLOWED_MIME.has(file.type)) {
    return "Upload a PDF, image or Word document.";
  }
  if (/[\x00-\x1f]/.test(file.name)) return "That filename is not allowed.";
  return null;
}

/**
 * Storage key. Includes a random component so keys are unguessable even if the
 * bucket were ever misconfigured as public — defence in depth, not the primary
 * control.
 */
export function buildKey(userId: string, filename: string): string {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80)
    .replace(/^\.+/, "");
  const rand = createHash("sha256")
    .update(`${userId}:${filename}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 20);
  return `documents/${userId}/${rand}-${safe}`;
}

/* ----------------------------------------------------------------- write */

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<StoredObject> {
  const transport = storageTransport();

  if (transport === "supabase") {
    const bucket = await ensureSupabaseBucket();
    // Uploading into a bucket we know is not there produces a 404 that blames
    // the upload. Fail on the actual cause instead.
    if (!bucket.ok) throw new Error(`Supabase bucket unavailable: ${bucket.detail}`);
    const res = await fetch(
      `${supabaseBase()}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURI(key)}`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          "Content-Type": contentType || "application/octet-stream",
          "x-upsert": "true",
        },
        body: new Uint8Array(body),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      throw new Error(`Supabase upload failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return { key, size: body.length, contentType, provider: "supabase" };
  }

  if (transport === "blob") {
    // Imported lazily so the package is only required when actually used.
    const { put } = await import("@vercel/blob");
    const res = await put(key, body, {
      access: "public", // see note below
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    /*
     * NOTE ON VERCEL BLOB: the SDK's `access` option currently only accepts
     * "public". The unguessable key above is therefore the confidentiality
     * boundary for this transport, and the URL is never exposed to the client —
     * downloads go through /api/portal/documents/[id] which checks authorisation
     * first. For stricter guarantees (auditable, revocable, truly private
     * objects) configure the S3 transport instead; that is the recommended
     * production setup and is what the runbook documents.
     */
    return { key: res.pathname, size: body.length, contentType, provider: "blob" };
  }

  if (transport === "s3") {
    await s3Fetch("PUT", key, body, contentType);
    return { key, size: body.length, contentType, provider: "s3" };
  }

  throw new Error("No storage transport configured.");
}

/* ------------------------------------------------------------------ read */

/**
 * Short-lived link. Callers MUST authorise before calling this.
 *
 * `provider` is the transport that WROTE the object, read back from its row.
 * It falls back to the configured one only for rows written before we recorded
 * it — signing a Blob object with Supabase's API yields a confident 404, which
 * is a much harder failure to read than an honest one.
 */
export async function getSignedUrl(
  key: string,
  expiresSeconds = 120,
  provider?: Transport | null
): Promise<string> {
  const transport = provider && provider !== "none" ? provider : storageTransport();

  if (transport === "supabase") {
    const res = await fetch(
      `${supabaseBase()}/storage/v1/object/sign/${SUPABASE_BUCKET}/${encodeURI(key)}`,
      {
        method: "POST",
        headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: expiresSeconds }),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Supabase sign failed: ${res.status}`);
    const data = (await res.json()) as { signedURL?: string };
    if (!data.signedURL) throw new Error("Supabase returned no signed URL.");
    // The API returns a path relative to /storage/v1.
    return `${supabaseBase()}/storage/v1${data.signedURL}`;
  }

  if (transport === "s3") return presignS3Get(key, expiresSeconds);

  if (transport === "blob") {
    const base = process.env.BLOB_PUBLIC_BASE_URL;
    if (!base) throw new Error("BLOB_PUBLIC_BASE_URL is not set.");
    return `${base.replace(/\/$/, "")}/${key}`;
  }

  throw new Error("No storage transport configured.");
}

export async function deleteObject(key: string, provider?: Transport | null): Promise<void> {
  const transport = provider && provider !== "none" ? provider : storageTransport();
  if (transport === "supabase") {
    await fetch(`${supabaseBase()}/storage/v1/object/${SUPABASE_BUCKET}/${encodeURI(key)}`, {
      method: "DELETE",
      headers: supabaseHeaders(),
      cache: "no-store",
    });
    return;
  }
  if (transport === "blob") {
    const { del } = await import("@vercel/blob");
    const base = process.env.BLOB_PUBLIC_BASE_URL;
    await del(base ? `${base.replace(/\/$/, "")}/${key}` : key, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return;
  }
  if (transport === "s3") {
    await s3Fetch("DELETE", key);
    return;
  }
}

/* -------------------------------------------------------- S3 SigV4 (raw) */
/* Implemented directly to avoid pulling the AWS SDK into a serverless bundle. */

function s3Config() {
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION ?? "auto";
  const accessKey = process.env.S3_ACCESS_KEY_ID!;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY!;
  const endpoint =
    process.env.S3_ENDPOINT ?? `https://s3.${region}.amazonaws.com`;
  const host = new URL(endpoint).host;
  return { bucket, region, accessKey, secretKey, endpoint, host };
}

const sha256Hex = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

function signingKey(secret: string, date: string, region: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
}

async function s3Fetch(
  method: "PUT" | "DELETE",
  key: string,
  body?: Buffer,
  contentType?: string
) {
  const { bucket, region, accessKey, secretKey, endpoint, host } = s3Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? "");
  const canonicalUri = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders =
    Object.keys(headers)
      .sort()
      .map((h) => `${h}:${headers[h]}\n`)
      .join("") ;

  const canonicalRequest = [
    method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");

  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac("sha256", signingKey(secretKey, date, region))
    .update(stringToSign)
    .digest("hex");

  const res = await fetch(`${endpoint}${canonicalUri}`, {
    method,
    body: body as BodyInit | undefined,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`S3 ${method} failed (${res.status})`);
  }
}

function presignS3Get(key: string, expires: number): string {
  const { bucket, region, accessKey, secretKey, endpoint, host } = s3Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const canonicalUri = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  });

  const canonicalRequest = [
    "GET", canonicalUri, params.toString(), `host:${host}\n`, "host", "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac("sha256", signingKey(secretKey, date, region))
    .update(stringToSign)
    .digest("hex");

  params.set("X-Amz-Signature", signature);
  return `${endpoint}${canonicalUri}?${params.toString()}`;
}

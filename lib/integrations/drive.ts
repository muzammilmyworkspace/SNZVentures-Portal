import { env } from "@/lib/env";

/**
 * GOOGLE DRIVE — exporting a complete case so it can be shared.
 * ---------------------------------------------------------------------------
 * WHY OAUTH AND NOT A SERVICE ACCOUNT. A service account has no Drive storage
 * of its own, and a file it creates inside a folder shared from a personal
 * Gmail account is owned by the service account — so every upload fails with
 * storageQuotaExceeded. Shared Drives solve it and require Google Workspace,
 * which this account is not. Connecting as the account owner is therefore the
 * only route that works here, and it has a better property anyway: every file
 * is owned by the firm, in the firm's Drive, and survives us being removed.
 *
 * THE SCOPE IS drive.file, DELIBERATELY. It grants access only to files this
 * application itself creates. We cannot read, list, or touch anything else in
 * the account — not the owner's email attachments, not their photos, not a
 * spreadsheet somebody shared with them. A full `drive` scope would have been
 * less work and is far more access than exporting a case requires.
 *
 * IT IS A SEPARATE FLOW FROM "SIGN IN WITH GOOGLE". Mixing them would ask
 * every student signing in to hand over Drive access, which is both alarming
 * and wrong.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const ROOT_FOLDER_NAME = "SnZ Ventures — Client Files";

export function driveConfigured(): boolean {
  return Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}

/**
 * Where Google sends the admin back.
 *
 * The request's own origin is preferred over a configured URL, because it
 * cannot be wrong: it is the address the browser actually reached us on.
 * NEXT_PUBLIC_PORTAL_URL was empty on this deployment, which produced a
 * relative redirect URI, which produced a 500 at the end of an otherwise
 * successful connection — the exact class of failure lib/env exists to stop.
 *
 * The env vars remain as a fallback for anywhere the request is not to hand.
 */
export function driveRedirectUri(origin?: string): string {
  const base =
    origin ?? env("NEXT_PUBLIC_PORTAL_URL") ?? env("NEXT_PUBLIC_SITE_URL") ?? "";
  return `${base.replace(/\/+$/, "")}/api/admin/drive/callback`;
}

/**
 * Where to send the admin to grant access.
 *
 * `access_type=offline` with `prompt=consent` is what actually returns a
 * refresh token. Google issues one only on the first consent unless consent is
 * forced — so a reconnection after AUTH_SECRET rotation, which cannot read the
 * old token, would otherwise come back with nothing and appear to succeed.
 */
export function driveAuthUrl(state: string, origin?: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID")!,
    redirect_uri: driveRedirectUri(origin),
    response_type: "code",
    scope: `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

type TokenSet = { accessToken: string; refreshToken: string | null; email: string | null };

async function readEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { email?: string } | null;
  return data?.email ?? null;
}

export async function exchangeCode(code: string, origin?: string): Promise<TokenSet | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID")!,
      client_secret: env("GOOGLE_CLIENT_SECRET")!,
      // Must be byte-identical to the one that started the flow, or Google
      // refuses the exchange — so it is derived the same way, from the origin.
      redirect_uri: driveRedirectUri(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
  } | null;
  if (!data?.access_token) return null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    email: await readEmail(data.access_token),
  };
}

/** A short-lived access token from the stored refresh token. */
export async function accessTokenFrom(refreshToken: string): Promise<string | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env("GOOGLE_CLIENT_ID")!,
      client_secret: env("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  return data?.access_token ?? null;
}

/* ────────────────────────────────────────────────────────────── files ─── */

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function api(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/**
 * Find or create a folder by name under a parent.
 *
 * Idempotent on purpose: exporting the same case twice should update one
 * folder, not leave two with the same name and no way to tell which is
 * current. `trashed = false` matters — a folder somebody deleted should be
 * recreated rather than found and written into invisibly.
 */
export async function ensureFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<{ id: string; url: string } | null> {
  const escaped = name.replace(/'/g, "\\'");
  const query = [
    `mimeType = '${FOLDER_MIME}'`,
    `name = '${escaped}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const found = await api(
    token,
    `/files?q=${encodeURIComponent(query)}&fields=files(id,webViewLink)&pageSize=1`
  );
  const existing = (found?.files as { id: string; webViewLink: string }[] | undefined)?.[0];
  if (existing) return { id: existing.id, url: existing.webViewLink };

  const created = await api(token, "/files?fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created?.id) return null;
  return { id: String(created.id), url: String(created.webViewLink ?? "") };
}

/**
 * Upload one file, replacing any earlier copy with the same name in the same
 * folder — a re-export should not leave "passport.pdf" beside a stale
 * "passport.pdf" that somebody might open instead.
 */
export async function putFile(
  token: string,
  folderId: string,
  name: string,
  body: Buffer,
  mimeType: string
): Promise<boolean> {
  const escaped = name.replace(/'/g, "\\'");
  const found = await api(
    token,
    `/files?q=${encodeURIComponent(`name = '${escaped}' and '${folderId}' in parents and trashed = false`)}&fields=files(id)&pageSize=1`
  );
  const existingId = (found?.files as { id: string }[] | undefined)?.[0]?.id;

  const boundary = `snz${Date.now().toString(36)}`;
  const metadata = existingId ? { name } : { name, parents: [folderId] };
  const multipart = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`
    ),
    body,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    existingId
      ? `${UPLOAD}/files/${existingId}?uploadType=multipart`
      : `${UPLOAD}/files?uploadType=multipart`,
    {
      method: existingId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(multipart),
      cache: "no-store",
    }
  );
  return res.ok;
}

/**
 * Give one named person read access to a folder.
 *
 * A NAMED PERSON, never "anyone with the link". These folders hold passports,
 * national identity cards and bank statements; a link-anyone permission is
 * permanent, unattributable, and one forward away from being public. Google
 * emails the person, so the recipient still gets a link — they just get it
 * addressed to them.
 */
export async function shareFolderWith(
  token: string,
  folderId: string,
  email: string,
  message?: string
): Promise<boolean> {
  const res = await fetch(
    `${API}/files/${folderId}/permissions?sendNotificationEmail=true${message ? `&emailMessage=${encodeURIComponent(message.slice(0, 900))}` : ""}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "user", emailAddress: email }),
      cache: "no-store",
    }
  );
  return res.ok;
}

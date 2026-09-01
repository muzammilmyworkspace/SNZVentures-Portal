"use client";

import { useState } from "react";

/**
 * SEND ONE CLIENT'S FILE TO DRIVE, AND OPTIONALLY TO A PERSON.
 *
 * The share field takes an email address, not a switch that makes the folder
 * public. These folders hold passports, national identity cards and bank
 * statements; "anyone with the link" is a permission that cannot be taken
 * back, cannot be attributed, and is one forward away from being public.
 * Named sharing costs one more field and is revocable.
 *
 * The result names what failed rather than reporting a round number. An export
 * that copied nine of eleven documents is not a success, and "Exported" over
 * the top of two missing passports is how somebody sends an incomplete file to
 * a university.
 */
export function DriveExport({
  userId,
  existing,
}: {
  userId: string;
  existing: { folderUrl: string; exportedAt: string; fileCount: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    url?: string;
    failed?: string[];
  } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/drive/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, shareWith: email.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        folderUrl?: string;
        files?: number;
        failed?: string[];
        shared?: boolean;
        shareError?: string | null;
      };

      if (!res.ok || !data.ok) {
        setResult({ ok: false, text: data.error ?? "That didn't go through." });
        return;
      }

      const parts = [`${data.files ?? 0} file${data.files === 1 ? "" : "s"} in Drive`];
      if (email.trim()) {
        parts.push(data.shared ? `shared with ${email.trim()}` : "but sharing failed");
      }
      setResult({
        ok: !data.shareError && !(data.failed?.length),
        text: parts.join(", ") + ".",
        url: data.folderUrl,
        failed: data.failed,
      });
    } catch {
      setResult({ ok: false, text: "Network problem. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {existing && (
        <p className="text-[0.84rem] leading-relaxed text-muted">
          Last sent {new Date(existing.exportedAt).toLocaleString()} · {existing.fileCount} files ·{" "}
          <a
            href={existing.folderUrl}
            target="_blank"
            rel="noopener"
            className="text-accent underline underline-offset-4"
          >
            open the folder
          </a>
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
        >
          {existing ? "Send again" : "Send this file to Drive"}
        </button>
      ) : (
        <div className="space-y-3 rounded-[var(--radius-sm)] border border-line p-4">
          <p className="text-[0.86rem] leading-relaxed text-muted">
            Copies the application, every uploaded document, the receipt and the signed undertaking
            into this client&rsquo;s folder.
          </p>

          <div>
            <label htmlFor="drive-share" className="field-label">
              Share with (optional)
            </label>
            <input
              id="drive-share"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admissions@university.edu"
            />
            <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
              Google emails them a link they can open. Leave blank to create the folder without
              sharing it with anyone.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send to Drive"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="label inline-flex min-h-11 items-center px-2 text-faint transition-colors hover:text-fg disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`rounded-[var(--radius-sm)] border p-4 text-[0.86rem] leading-relaxed ${
            result.ok
              ? "border-moss-500/40 bg-moss-500/10 text-ok"
              : "border-amber-300/40 bg-amber-300/[0.07] text-fg"
          }`}
        >
          <p>{result.text}</p>
          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-block text-accent underline underline-offset-4"
            >
              Open the folder
            </a>
          )}
          {result.failed && result.failed.length > 0 && (
            <p className="mt-2 text-[0.82rem]">
              Did not copy: {result.failed.join(", ")}. Try again, or check the client&rsquo;s
              documents.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

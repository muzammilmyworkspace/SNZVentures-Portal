"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * THE CONSENT STUDENTS SIGN — publish a new version, or switch between them.
 *
 * Text can be typed here, a PDF / Word file uploaded, or both (the text is
 * shown on screen and the file is linked above it). Publishing makes it the
 * one every student signs from then on; older signatures keep their version.
 */

export type ConsentRow = {
  id: string;
  version: number;
  versionLabel: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  fileName: string | null;
  isCurrent: boolean;
  logoUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  signed: number;
};

const PRIMARY =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-moss-400 px-5 text-[0.9rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";
const GHOST =
  "inline-flex min-h-9 items-center gap-2 rounded-full border border-line px-4 text-[0.82rem] font-medium text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-50";

export function ConsentPublisher({
  defaultTitle,
  storageOn,
  currentLogoUrl,
}: {
  defaultTitle: string;
  storageOn: boolean;
  /** The logo of the version in use, carried over unless replaced or removed. */
  currentLogoUrl: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"type" | "upload">("type");
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [keepLogo, setKeepLogo] = useState(Boolean(currentLogoUrl));
  const shownLogo = logoPreview ?? (keepLogo ? currentLogoUrl : null);

  function pickLogo(f: File | null) {
    setError(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (f && !["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setError("The logo must be a PNG, JPG or WebP image.");
      f = null;
    } else if (f && f.size > 512 * 1024) {
      setError("The logo must be 512 KB or smaller.");
      f = null;
    }
    setLogo(f);
    setLogoPreview(f ? URL.createObjectURL(f) : null);
    if (!f && logoInput.current) logoInput.current.value = "";
  }

  async function publish() {
    setError(null);
    setDone(null);
    if (title.trim().length < 3) return setError("Give the consent a title.");
    if (mode === "type" && body.trim().length < 20) return setError("Type the consent text (at least a sentence).");
    if (mode === "upload" && !file) return setError("Choose the PDF or Word file.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      if (body.trim()) form.set("body", body.trim());
      if (mode === "upload" && file) form.set("file", file);
      if (logo) form.set("logo", logo);
      else if (keepLogo) form.set("keepLogo", "1");
      const res = await fetch("/api/admin/forms/consent", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; version?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setDone(`Version ${data.version} is live. Students sign this one from now on.`);
      setBody("");
      setFile(null);
      if (input.current) input.current.value = "";
      pickLogo(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full border border-line p-1" role="tablist" aria-label="How to add the consent">
        {(
          [
            ["type", "Type it here"],
            ["upload", "Upload PDF / Word"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={mode === k}
            onClick={() => setMode(k)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[0.85rem] font-medium transition-colors",
              mode === k ? "bg-[var(--accent)] text-[#070B1A]" : "text-muted hover:text-fg"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <span className="field-label">Logo (optional)</span>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-40 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="Logo preview" className="max-h-16 max-w-[9rem] object-contain" />
            ) : (
              <span className="text-[0.75rem] text-faint">No logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={cn(GHOST, "cursor-pointer")}>
              {shownLogo ? "Change logo" : "Upload logo"}
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
              />
            </label>
            {shownLogo && (
              <button
                type="button"
                onClick={() => {
                  pickLogo(null);
                  setKeepLogo(false);
                }}
                className={GHOST}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <span className="mt-1 block text-[0.75rem] text-faint">PNG, JPG or WebP, up to 512 KB. Shown at the top of the consent.</span>
      </div>

      <label className="block">
        <span className="field-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="field" />
      </label>

      {mode === "upload" && (
        <div>
          <span className="field-label">Document</span>
          {!storageOn && (
            <p className="mb-2 rounded-[10px] border border-amber-300/40 bg-amber-300/[0.08] px-3 py-2 text-[0.82rem] text-warn">
              File storage is not set up on this server, so uploads will fail. Type the text instead.
            </p>
          )}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] px-5 py-8 text-center hover:border-[var(--accent)]">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-faint" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
            </svg>
            <span className="text-[0.9rem] text-fg">{file ? file.name : "Choose a PDF or Word file"}</span>
            <span className="text-[0.75rem] text-faint">Up to 15 MB. Students open it before they sign.</span>
            <input
              ref={input}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}

      <label className="block">
        <span className="field-label">
          {mode === "type" ? "Consent text" : "Text shown with the document (optional)"}
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={mode === "type" ? 14 : 4}
          maxLength={30000}
          placeholder={
            mode === "type"
              ? "Write the consent exactly as students should read it. Leave a blank line between clauses."
              : "e.g. Please read the attached consent in full before signing."
          }
          className="field min-h-0 py-3 leading-relaxed"
        />
        {mode === "type" && <span className="mt-1 block text-[0.75rem] text-faint">A blank line starts a new paragraph.</span>}
      </label>

      {error && (
        <p role="alert" className="text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      {done && <p className="text-[0.85rem] text-ok">{done}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={publish} disabled={busy} className={PRIMARY}>
          {busy ? "Publishing…" : "Publish as the new consent"}
        </button>
        <span className="text-[0.78rem] text-faint">Signatures already given keep the version they signed.</span>
      </div>
    </div>
  );
}

export function ConsentVersions({
  rows,
  builtIn,
}: {
  rows: ConsentRow[];
  builtIn: { title: string; version: string; signed: number; isCurrent: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function makeCurrent(id: string | null) {
    setBusy(id ?? "builtin");
    setError(null);
    try {
      const res = await fetch("/api/admin/forms/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  const Current = () => <span className="pill pill-ok">In use</span>;

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <ul className="divide-y divide-[var(--line)]">
        {rows.map((r) => (
          <li key={r.id} className="py-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="num w-10 shrink-0 font-mono text-[0.8rem] text-faint">v{r.version}</span>
              {r.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logoUrl} alt="" className="h-8 w-auto max-w-[4rem] shrink-0 object-contain" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold text-fg-strong">{r.title}</p>
                <p className="text-[0.76rem] text-faint">
                  {new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {r.createdBy ? ` · ${r.createdBy}` : ""} · {r.body ? "Text" : ""}
                  {r.body && r.fileName ? " + " : ""}
                  {r.fileName ? "Document" : ""} · {r.signed} signed
                </p>
              </div>
              {r.isCurrent && <Current />}
              {r.fileUrl && (
                <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className={GHOST}>
                  Open file
                </a>
              )}
              {r.body && (
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className={GHOST}>
                  {open === r.id ? "Hide text" : "Read text"}
                </button>
              )}
              {!r.isCurrent && (
                <button type="button" onClick={() => makeCurrent(r.id)} disabled={busy !== null} className={GHOST}>
                  {busy === r.id ? "Switching…" : "Use this one"}
                </button>
              )}
            </div>
            {open === r.id && r.body && (
              <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-line p-4 text-[0.85rem] leading-relaxed text-muted">
                {r.body}
              </div>
            )}
          </li>
        ))}
        <li className="py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="num w-10 shrink-0 font-mono text-[0.8rem] text-faint">—</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.92rem] font-semibold text-fg-strong">{builtIn.title} (original)</p>
              <p className="text-[0.76rem] text-faint">
                Built into the portal · {builtIn.version} · {builtIn.signed} signed
              </p>
            </div>
            {builtIn.isCurrent ? (
              <Current />
            ) : (
              <button type="button" onClick={() => makeCurrent(null)} disabled={busy !== null} className={GHOST}>
                {busy === "builtin" ? "Switching…" : "Use this one"}
              </button>
            )}
          </div>
        </li>
      </ul>
    </div>
  );
}

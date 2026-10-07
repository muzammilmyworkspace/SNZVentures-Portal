"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ConsentDoc } from "@/components/application/UndertakingDoc";
import type { ConsentView } from "@/lib/portal/forms";

/**
 * CONSENT DOCUMENTS — make, edit, publish, switch on and off, delete.
 *
 *   New:       type it, or upload a PDF / Word file whose text becomes a draft
 *   Draft:     edit the title, text and logo; preview; publish
 *   Published: the one in use is "Active"; others can be made active again,
 *              made inactive, copied into a new draft (Edit), or deleted if
 *              nobody has signed them
 *
 * Whatever the source, students and consultants see it in the same style:
 * the preview here is the same component they sign under.
 */

export type ConsentRow = {
  id: string;
  version: number;
  versionLabel: string;
  title: string;
  body: string | null;
  status: "draft" | "published";
  isCurrent: boolean;
  logoUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  createdBy: string | null;
  updatedAt: string;
  publishedAt: string | null;
  signed: number;
};

const PRIMARY =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-moss-400 px-5 text-[0.9rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";
const GHOST =
  "inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-[0.85rem] font-medium text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-50";
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

async function send(fields: Record<string, string | File | null | undefined>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.set(k, v);
  const res = await fetch("/api/admin/forms/consent", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
  return { ok: Boolean(res.ok && data.ok), id: data.id, error: data.error ?? (res.ok ? undefined : "That didn't save.") };
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/* ------------------------------------------------------------- logo */

function LogoPicker({
  current,
  onPick,
  onRemove,
}: {
  current: string | null;
  onPick: (f: File | null, preview: string | null) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <span className="field-label">Logo (optional)</span>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-16 w-36 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)]">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="Logo" className="max-h-12 max-w-[8rem] object-contain" />
          ) : (
            <span className="text-[0.75rem] text-faint">No logo</span>
          )}
        </div>
        <label className={cn(GHOST, "cursor-pointer")}>
          {current ? "Change" : "Upload logo"}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setError(null);
              if (f && (!LOGO_TYPES.includes(f.type) || f.size > 512 * 1024)) {
                setError("PNG, JPG or WebP, up to 512 KB.");
                if (input.current) input.current.value = "";
                return;
              }
              onPick(f, f ? URL.createObjectURL(f) : null);
            }}
          />
        </label>
        {current && (
          <button
            type="button"
            className={GHOST}
            onClick={() => {
              if (input.current) input.current.value = "";
              onRemove();
            }}
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[0.8rem] text-danger">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- new */

export function ConsentNew({
  category,
  defaultTitle,
  logoInUse,
  storageOn,
  basePath,
}: {
  category: string;
  defaultTitle: string;
  /** The logo of the version in use, carried over unless changed. */
  logoInUse: string | null;
  storageOn: boolean;
  /** This page's URL; the new draft opens at `${basePath}&edit=<id>`. */
  basePath: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"type" | "upload">("type");
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [keepLogo, setKeepLogo] = useState(Boolean(logoInUse));
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  const [error, setError] = useState<string | null>(null);

  async function create(publish: boolean) {
    setError(null);
    if (mode === "upload" && !file) return setError("Choose the PDF or Word file.");
    if (mode === "type" && body.trim().length < 20) return setError("Write the consent text (at least a sentence).");
    setBusy(publish ? "publish" : "draft");
    const r = await send({
      action: "create",
      category,
      title: title.trim(),
      body: mode === "type" ? body.trim() : "",
      file: mode === "upload" ? file : null,
      logo,
      keepLogo: !logo && keepLogo ? "1" : null,
      publish: publish ? "1" : null,
    });
    setBusy(null);
    if (!r.ok || !r.id) return setError(r.error ?? "That didn't save.");
    setBody("");
    setFile(null);
    setLogo(null);
    setLogoPreview(null);
    // A draft opens in the editor; a published one shows in the list.
    router.push(publish ? basePath : `${basePath}${basePath.includes("?") ? "&" : "?"}edit=${r.id}`);
    router.refresh();
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

      <label className="block">
        <span className="field-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="field" />
      </label>

      <LogoPicker
        current={logoPreview ?? (keepLogo ? logoInUse : null)}
        onPick={(f, preview) => {
          setLogo(f);
          setLogoPreview(preview);
        }}
        onRemove={() => {
          setLogo(null);
          setLogoPreview(null);
          setKeepLogo(false);
        }}
      />

      {mode === "upload" ? (
        <div>
          <span className="field-label">Document</span>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] px-5 py-8 text-center hover:border-[var(--accent)]">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-faint" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
            </svg>
            <span className="text-[0.9rem] text-fg">{file ? file.name : "Choose a PDF or Word (.docx) file"}</span>
            <span className="text-[0.75rem] text-faint">
              We read the text into a draft you can edit before publishing.
              {storageOn ? " The original file is kept with it." : ""}
            </span>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      ) : (
        <label className="block">
          <span className="field-label">Consent text</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            maxLength={30000}
            placeholder="Write the consent exactly as it should be read. Leave a blank line between clauses."
            className="field min-h-0 py-3 leading-relaxed"
          />
          <span className="mt-1 block text-[0.75rem] text-faint">A blank line starts a new paragraph.</span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-[0.85rem] text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => create(false)} disabled={busy !== null} className={PRIMARY}>
          {busy === "draft" ? (mode === "upload" ? "Reading the file…" : "Saving…") : mode === "upload" ? "Make a draft from this file" : "Save as draft"}
        </button>
        {mode === "type" && (
          <button type="button" onClick={() => create(true)} disabled={busy !== null} className={GHOST}>
            {busy === "publish" ? "Publishing…" : "Publish now"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ editor */

export function ConsentEditor({
  row,
  party,
  closeHref,
}: {
  row: ConsentRow;
  party: string;
  closeHref: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body ?? "");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoShown, setLogoShown] = useState<string | null>(row.logoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "publish" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTitle(row.title);
    setBody(row.body ?? "");
    setLogoShown(row.logoUrl);
    setLogo(null);
    setRemoveLogo(false);
  }, [row.id, row.title, row.body, row.logoUrl]);

  const preview: ConsentView = useMemo(
    () => ({
      id: row.id,
      title: title || "Untitled",
      party,
      version: row.versionLabel,
      body,
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      logoUrl: logoShown,
      custom: true,
    }),
    [row, title, body, logoShown, party]
  );

  async function save(publish: boolean) {
    setError(null);
    setSaved(false);
    if (publish && !window.confirm("Publish this version? It replaces the one in use, and people sign this one from now on.")) return;
    setBusy(publish ? "publish" : "save");
    const r = await send({
      action: "update",
      id: row.id,
      title: title.trim(),
      body: body.trim(),
      logo,
      removeLogo: removeLogo && !logo ? "1" : null,
      publish: publish ? "1" : null,
    });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "That didn't save.");
    if (publish) {
      router.push(closeHref);
    } else {
      setSaved(true);
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this draft?")) return;
    setBusy("delete");
    const r = await send({ action: "delete", id: row.id });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "That didn't delete.");
    router.push(closeHref);
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill pill-warn">Draft · v{row.version}</span>
          {row.fileName && <span className="text-[0.78rem] text-faint">From {row.fileName}</span>}
        </div>
        <label className="block">
          <span className="field-label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="field" />
        </label>
        <LogoPicker
          current={logoShown}
          onPick={(f, p) => {
            setLogo(f);
            setLogoShown(p);
            setRemoveLogo(false);
          }}
          onRemove={() => {
            setLogo(null);
            setLogoShown(null);
            setRemoveLogo(true);
          }}
        />
        <label className="block">
          <span className="field-label">Consent text</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            maxLength={30000}
            className="field min-h-0 py-3 leading-relaxed"
          />
          <span className="mt-1 block text-[0.75rem] text-faint">A blank line starts a new paragraph. Check the text read from a file before publishing.</span>
        </label>
        {error && (
          <p role="alert" className="text-[0.85rem] text-danger">
            {error}
          </p>
        )}
        {saved && <p className="text-[0.85rem] text-ok">Draft saved.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save(true)} disabled={busy !== null} className={PRIMARY}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
          <button type="button" onClick={() => save(false)} disabled={busy !== null} className={GHOST}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button type="button" onClick={remove} disabled={busy !== null} className={cn(GHOST, "hover:!border-red-400/60 hover:!text-danger")}>
            {busy === "delete" ? "Deleting…" : "Delete draft"}
          </button>
          <Link href={closeHref} className="text-[0.85rem] text-muted underline underline-offset-4 hover:text-fg">
            Close
          </Link>
        </div>
      </div>
      <div>
        <span className="field-label">Preview — exactly as it will be shown</span>
        <ConsentDoc consent={preview} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- versions */

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function ConsentVersions({
  rows,
  party,
  basePath,
  builtIn,
}: {
  rows: ConsentRow[];
  party: string;
  /** This page's URL, to which `edit=` is added. */
  basePath: string;
  /** SnZ's student consent only: the wording built into the portal. */
  builtIn?: { title: string; version: string; signed: number; isCurrent: boolean } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ConsentRow | null>(null);
  const join = basePath.includes("?") ? "&" : "?";

  async function act(action: string, row: ConsentRow, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(row.id + action);
    setError(null);
    const r = await send({ action, id: row.id });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    if (action === "edit" && r.id) router.push(`${basePath}${join}edit=${r.id}`);
    router.refresh();
  }

  const current = rows.find((r) => r.isCurrent) ?? null;

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      {rows.length === 0 && !builtIn && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-line p-4 text-[0.88rem] text-muted">
          Nothing yet. Make one with New consent.
        </p>
      )}
      <ul className="divide-y divide-[var(--line)]">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-3.5">
            <span className="w-9 shrink-0 font-mono text-[0.8rem] text-faint">v{r.version}</span>
            {r.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logoUrl} alt="" className="h-8 w-auto max-w-[4rem] shrink-0 object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.92rem] font-semibold text-fg-strong">{r.title}</p>
              <p className="text-[0.76rem] text-faint">
                {r.status === "draft" ? `Edited ${when(r.updatedAt)}` : `Published ${when(r.publishedAt)}`}
                {r.createdBy ? ` · ${r.createdBy}` : ""} · {r.signed} signed
              </p>
            </div>
            {r.status === "draft" ? (
              <span className="pill pill-warn">Draft</span>
            ) : r.isCurrent ? (
              <span className="pill pill-ok">Active</span>
            ) : (
              <span className="pill pill-neutral">Inactive</span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <button type="button" onClick={() => setViewing(r)} aria-label="Preview" data-tip="Preview" className="tip icon-btn">
                <Icon d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </button>
              {r.status === "draft" ? (
                <Link href={`${basePath}${join}edit=${r.id}`} aria-label="Edit draft" data-tip="Edit draft" className="tip icon-btn">
                  <Icon d="M10.5 2.5l3 3L6 13H3v-3z" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => act("edit", r)}
                  disabled={busy !== null}
                  aria-label="Edit as a new draft"
                  data-tip="Edit (new draft)"
                  className="tip icon-btn"
                >
                  <Icon d="M10.5 2.5l3 3L6 13H3v-3z" />
                </button>
              )}
              {r.status === "draft" ? (
                <button
                  type="button"
                  onClick={() => act("publish", r, "Publish this version? It replaces the one in use.")}
                  disabled={busy !== null}
                  aria-label="Publish"
                  data-tip="Publish"
                  className="tip icon-btn !border-moss-400/60 !text-ok"
                >
                  <Icon d="M8 12V3M4.5 6.5L8 3l3.5 3.5M3 13.5h10" />
                </button>
              ) : r.isCurrent ? (
                <button
                  type="button"
                  onClick={() => act("deactivate", r, "Make this inactive? Nobody will be asked to sign it until you activate one.")}
                  disabled={busy !== null}
                  aria-label="Make inactive"
                  data-tip="Make inactive"
                  className="tip icon-btn"
                >
                  <Icon d="M5.5 4v8M10.5 4v8" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => act("activate", r, current ? "Make this the active one? It replaces the one in use." : undefined)}
                  disabled={busy !== null}
                  aria-label="Make active"
                  data-tip="Make active"
                  className="tip icon-btn"
                >
                  <Icon d="M5 3.5l7 4.5-7 4.5z" />
                </button>
              )}
              <button
                type="button"
                onClick={() => act("delete", r, `Delete v${r.version}? This cannot be undone.`)}
                disabled={busy !== null || (r.status === "published" && r.signed > 0)}
                aria-label="Delete"
                data-tip={r.status === "published" && r.signed > 0 ? "Signed, so it is kept" : "Delete"}
                className="tip tip-end icon-btn hover:!border-red-400/60 hover:!text-danger disabled:opacity-30"
              >
                <Icon d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />
              </button>
            </span>
          </li>
        ))}
        {builtIn && (
          <li className="flex flex-wrap items-center gap-3 py-3.5">
            <span className="w-9 shrink-0 font-mono text-[0.8rem] text-faint">—</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.92rem] font-semibold text-fg-strong">{builtIn.title} (original)</p>
              <p className="text-[0.76rem] text-faint">
                Built into the portal · {builtIn.version} · {builtIn.signed} signed · used when none is active
              </p>
            </div>
            {builtIn.isCurrent ? <span className="pill pill-ok">Active</span> : <span className="pill pill-neutral">Standby</span>}
          </li>
        )}
      </ul>

      {viewing &&
        createPortal(
          <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Preview">
            <button type="button" aria-label="Close" onClick={() => setViewing(null)} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
            <div className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-[1.05rem] font-semibold text-fg-strong">v{viewing.version} · as people see it</h2>
                <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="icon-btn">
                  <Icon d="M4 4l8 8M12 4l-8 8" />
                </button>
              </div>
              <ConsentDoc
                consent={{
                  id: viewing.id,
                  title: viewing.title,
                  party,
                  version: viewing.versionLabel,
                  body: viewing.body,
                  fileUrl: viewing.fileUrl,
                  fileName: viewing.fileName,
                  logoUrl: viewing.logoUrl,
                  custom: true,
                }}
              />
            </div>
          </div>,
          document.querySelector(".portal-shell") ?? document.body
        )}
    </div>
  );
}

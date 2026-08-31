"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * DOCUMENT UPLOAD
 * ---------------------------------------------------------------------------
 * Posts to /api/portal/documents, which validates size and MIME type again on
 * the server and stores the file under an unguessable key in PRIVATE object
 * storage. The browser never learns the storage key and never touches storage
 * directly — downloads go through an authorised route that mints a short-lived
 * signed URL per request.
 *
 * The dropzone is a real <button> wrapping a visually-hidden <input type=file>.
 * A div with a click handler looks identical and is unreachable by keyboard,
 * which would make uploading a passport impossible without a mouse.
 */

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx";
const MAX_MB = 15;

type Slot = { name: string; category: string };

export function DocumentUploader({
  slots,
  configured,
}: {
  /** The checklist for this pathway, so a file arrives already labelled. */
  slots: Slot[];
  /** False when no storage transport is set — the form says so rather than failing on submit. */
  configured: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [slot, setSlot] = useState(slots[0]?.name ?? "Other");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function accept(f: File | undefined | null) {
    setError(null);
    setDone(null);
    if (!f) return;
    // Checked here for a fast, clear message; the server checks again because
    // this one is trivially bypassed.
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);

    const chosen = slots.find((s) => s.name === slot);
    const body = new FormData();
    body.append("file", file);
    body.append("name", chosen?.name ?? file.name);
    body.append("category", chosen?.category ?? "Other");

    try {
      const res = await fetch("/api/portal/documents", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        setBusy(false);
        return;
      }
      setDone(`${chosen?.name ?? file.name} uploaded.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network problem. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <p className="text-[0.9rem] leading-relaxed text-muted">
        Uploads are switched off on this deployment because secure document
        storage has not been configured yet. Please don&rsquo;t email documents
        containing passport or financial details — we&rsquo;ll tell you the
        moment this is available.
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="doc-slot" className="field-label">
            What is this document?
          </label>
          <select
            id="doc-slot"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            className="field"
          >
            {slots.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
            <option value="Other">Something else</option>
          </select>
        </div>
      </div>

      {/* Dropzone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "mt-4 flex w-full flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed px-5 py-8 text-center transition-colors",
          dragging
            ? "border-moss-400 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            : "border-line hover:border-moss-400/60"
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-6 w-6 text-accent">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="mt-3 block text-[0.95rem] font-medium text-fg">
          {file ? file.name : "Choose a file or drag it here"}
        </span>
        <span className="mt-1 block text-[0.8rem] text-faint">
          PDF, JPG, PNG or Word · up to {MAX_MB} MB
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] text-red-300">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 text-[0.85rem] text-accent">
          {done} We&rsquo;ll review it and update its status.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={upload}
          disabled={!file || busy}
          className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        {file && !busy && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="label min-h-11 px-2 text-muted transition-colors hover:text-fg"
          >
            Remove
          </button>
        )}
      </div>

      <p className="mt-4 text-[0.75rem] leading-relaxed text-faint">
        Documents are stored privately and are visible only to you and the SnZ
        staff working on your case.
      </p>
    </div>
  );
}

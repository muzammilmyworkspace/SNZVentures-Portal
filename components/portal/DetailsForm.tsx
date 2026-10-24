"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AvatarPicker } from "./AvatarPicker";

/**
 * A student's first step (SNZ, 2026-10-24): a photo and the basic details we
 * need to reach them. Posts to /api/auth/details; the portal opens after.
 */
const FIELDS = [
  { key: "phone", label: "Phone / WhatsApp", type: "tel", placeholder: "+92 300 1234567", wide: true },
  { key: "nationality", label: "Nationality", placeholder: "Pakistani" },
  { key: "city", label: "City", placeholder: "Lahore" },
  { key: "country", label: "Country you live in", placeholder: "Pakistan", wide: true },
] as const;

export function DetailsForm({ name, email, known }: { name: string; email: string; known: Record<string, string> }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(known);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!avatar && !known.hasPhoto) {
      setError("Add a profile photo to continue.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through. Please try again.");
        return;
      }
      router.push(data.redirectTo ?? "/portal");
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}
      <div className="rail p-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
          <span className="label text-faint">Name</span>
          <span className="text-[0.9rem] text-fg">{name}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4 pt-2.5">
          <span className="label text-faint">Email</span>
          <span className="truncate text-[0.9rem] text-fg">{email}</span>
        </div>
      </div>

      {known.hasPhoto ? null : <AvatarPicker value={avatar} onChange={setAvatar} name={name} required />}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={"wide" in f ? "sm:col-span-2" : undefined}>
            <label htmlFor={`d-${f.key}`} className="field-label">
              {f.label}
            </label>
            <input
              id={`d-${f.key}`}
              type={"type" in f ? f.type : "text"}
              required
              maxLength={120}
              className="field"
              placeholder={f.placeholder}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-moss-400 px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}

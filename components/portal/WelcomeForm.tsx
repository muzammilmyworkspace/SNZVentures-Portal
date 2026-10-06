"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AvatarPicker } from "./AvatarPicker";
import { PasswordField } from "./PasswordField";

/**
 * FIRST SIGN-IN for an Admin (the student desk): a photo, a few details, and
 * a password of their own in place of the one that came by email. Posts to
 * /api/auth/welcome.
 */
const FIELDS = [
  { key: "phone", label: "Phone / WhatsApp", type: "tel", placeholder: "+92 300 1234567" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
] as const;

export function WelcomeForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, avatar, ...form }),
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
          <span className="label text-faint">Username</span>
          <span className="text-[0.9rem] text-fg">{email}</span>
        </div>
      </div>

      <AvatarPicker value={avatar} onChange={setAvatar} name={name} />

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.key === "phone" ? "sm:col-span-2" : undefined}>
            <label htmlFor={`w-${f.key}`} className="field-label">
              {f.label}
            </label>
            <input
              id={`w-${f.key}`}
              type={"type" in f ? f.type : "text"}
              required
              className="field"
              placeholder={"placeholder" in f ? f.placeholder : undefined}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <PasswordField
        id="w-password"
        label="Choose your own password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
        hint="At least 8 characters. The password from the email stops working."
      />
      <PasswordField
        id="w-confirm"
        label="Confirm password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />

      <button
        type="submit"
        disabled={busy || !password || !confirm}
        className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-12 w-full items-center justify-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}

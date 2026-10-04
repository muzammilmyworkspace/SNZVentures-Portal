"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/portal/PasswordField";
import { AvatarPicker } from "@/components/portal/AvatarPicker";

/**
 * FIRST SIGN-IN, IN TWO STEPS.
 *
 * Details first, password second, and that order is deliberate: the details
 * are the reason this screen exists rather than the password screen, and
 * putting them after would make them feel like an afterthought somebody could
 * rush.
 *
 * Name and email are shown but locked. The person did not choose them — an
 * administrator did, and the invitation was sent to that address — so an
 * editable field here would invite somebody to change what they were invited
 * as, and then wonder why the email never arrives again. Both are still shown,
 * because "who am I setting this up as" is the first thing anybody checks.
 *
 * Nothing is saved until the last press. The two steps are one submission, so
 * a person who stops halfway has spent nothing and their link still works.
 */

const FIELDS = [
  { key: "phone", label: "Phone number", type: "tel", placeholder: "+92 300 1234567" },
  { key: "company", label: "Company name", placeholder: "Your firm or practice" },
  { key: "address_line", label: "Company address", placeholder: "Street and number" },
  { key: "city", label: "City" },
  { key: "postcode", label: "Zip / postcode" },
  { key: "country", label: "Country" },
] as const;

export function SetUpForm({
  token,
  name,
  email,
}: {
  token: string;
  name: string;
  email: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = FIELDS.every((f) => (form[f.key] ?? "").trim());

  function next(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/set-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, avatar, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through. Please try again.");
        /*
          A rejected field belongs to step one, so send them back to where they
          can fix it. Leaving them on the password step with a message about
          their phone number is how a form becomes unsolvable.
        */
        if (data.error && /enter your/i.test(data.error)) setStep(1);
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
    <div>
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {[1, 2].map((n) => (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span
              aria-current={step === n ? "step" : undefined}
              className={`label flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.7rem] ${
                step >= n ? "bg-moss-400 text-navy-950" : "border border-line text-faint"
              }`}
            >
              {n}
            </span>
            <span className={`label ${step === n ? "text-fg" : "text-faint"}`}>
              {n === 1 ? "Your details" : "Password"}
            </span>
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="note-danger mb-4 p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      {step === 1 ? (
        <form onSubmit={next} className="space-y-4">
          {/*
            Locked, not hidden. Somebody setting up an account checks who it is
            for before they type anything, and a field they cannot change still
            answers that.
          */}
          <div className="rail p-4">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
              <span className="label text-faint">Full name</span>
              <span className="text-[0.9rem] text-fg">{name}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 pt-2.5">
              <span className="label text-faint">Email</span>
              <span className="text-[0.9rem] text-fg">{email}</span>
            </div>
            <p className="mt-2.5 text-[0.75rem] leading-relaxed text-faint">
              Set by SnZ Ventures, and what you will sign in with. Tell us if either is wrong.
            </p>
          </div>

          <AvatarPicker value={avatar} onChange={setAvatar} name={name} />

          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.key === "address_line" ? "sm:col-span-2" : undefined}>
                <label htmlFor={`s-${f.key}`} className="field-label">
                  {f.label}
                </label>
                <input
                  id={`s-${f.key}`}
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

          <button
            type="submit"
            disabled={!complete}
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-12 w-full items-center justify-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
          >
            Continue
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            id="s-password"
            label="Choose a password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
            hint="At least 8 characters. You will use this with the email above."
          />
          <PasswordField
            id="s-confirm"
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
            {busy ? "Setting up…" : "Finish and sign in"}
          </button>

          <button
            type="button"
            onClick={() => setStep(1)}
            className="label min-h-11 w-full text-muted underline underline-offset-4 transition-colors hover:text-fg"
          >
            Back to your details
          </button>
        </form>
      )}
    </div>
  );
}

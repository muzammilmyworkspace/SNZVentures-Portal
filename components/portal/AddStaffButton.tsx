"use client";

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AREAS } from "@/lib/portal/permissions";

/**
 * "Add consultant" / "Add employee": a button at the top right of the page
 * that opens a small window.
 *
 *   consultant  name and email. They get an email with a set-up link, add
 *               their photo and details, choose a password and sign in; their
 *               consultant code is made the moment the account exists.
 *   employee    the same, plus the areas of the portal they may use. They see
 *               only those once they sign in.
 *
 * Posts to /api/admin/staff (super admin only), which also returns the link,
 * so it can be passed on by hand where email is not set up.
 */
export function AddStaffButton({ kind }: { kind: "consultant" | "employee" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; link: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const label = kind === "employee" ? "employee" : "consultant";

  function close() {
    setOpen(false);
    setCreated(null);
    setError(null);
    setName("");
    setEmail("");
    setAreas([]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "employee" && areas.length === 0) {
      setError("Tick at least one area they may use.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, kind, permissions: areas }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        name?: string;
        email?: string;
        link?: string;
        emailed?: boolean;
      };
      if (!res.ok || !data.ok || !data.link) throw new Error(data.error ?? "We couldn't create that account.");
      setCreated({ name: data.name ?? name, email: data.email ?? email, link: data.link, emailed: Boolean(data.emailed) });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[0.95rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="h-4 w-4">
          <path d="M8 3v10M3 8h10" />
        </svg>
        Add {label}
      </button>

      {/*
        Into <body>, not here: the page heading this button sits in is
        animated with a transform, which would make "fixed" relative to the
        heading and let the list below cover the window.
      */}
      {open && createPortal(
        <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="add-staff-title">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-[rgb(4_8_20/0.6)] backdrop-blur-[2px]" />
          <div className="relative w-full max-w-lg rounded-[18px] border border-line bg-[var(--panel-solid)] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 id="add-staff-title" className="text-[1.15rem] font-semibold text-fg-strong">
                Add {label}
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="icon-btn">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            {created ? (
              <div className="mt-5 space-y-4">
                <p className={created.emailed ? "note-ok p-4" : "note-warn p-4"}>
                  <span className="text-[0.88rem] leading-relaxed">
                    <strong className="font-semibold">{created.name}</strong> has been added.{" "}
                    {created.emailed
                      ? `We have emailed ${created.email} a link to set up their account, add their photo and details, and choose a password.`
                      : "Email is not set up here, so nothing was sent. Send them this link yourself:"}
                  </span>
                </p>
                {!created.emailed && (
                  <div className="rail break-all p-4 font-mono text-[0.8rem] leading-relaxed text-fg">{created.link}</div>
                )}
                <div className="flex flex-wrap gap-3">
                  {!created.emailed && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(created.link);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {}
                      }}
                      className="inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-4 text-[0.88rem] font-semibold text-[#070B1A]"
                    >
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  )}
                  <button type="button" onClick={close} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-muted hover:text-fg">
                    Done
                  </button>
                </div>
                <p className="text-[0.78rem] text-faint">The link works once and expires in three days.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="staff-name" className="field-label">Full name</label>
                  <input id="staff-name" required className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayesha Rahman" />
                </div>
                <div>
                  <label htmlFor="staff-email" className="field-label">Email</label>
                  <input id="staff-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                </div>

                {kind === "employee" && (
                  <fieldset>
                    <legend className="field-label">What they may use</legend>
                    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {AREAS.map((a) => (
                        <label
                          key={a.key}
                          className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line p-3 transition-colors has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                        >
                          <input
                            type="checkbox"
                            checked={areas.includes(a.key)}
                            onChange={(e) =>
                              setAreas((cur) => (e.target.checked ? [...cur, a.key] : cur.filter((k) => k !== a.key)))
                            }
                            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                          />
                          <span>
                            <span className="block text-[0.88rem] font-semibold text-fg">{a.label}</span>
                            <span className="block text-[0.75rem] leading-snug text-faint">{a.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-[0.75rem] text-faint">Dashboard and Messages are always available. You can change this later.</p>
                  </fieldset>
                )}

                {error && <p role="alert" className="text-[0.85rem] text-danger">{error}</p>}

                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.9rem] text-muted hover:text-fg">
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 text-[0.9rem] font-semibold text-[#070B1A] disabled:opacity-50">
                    {busy ? "Adding…" : `Add and send email`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ConsentDoc } from "@/components/application/UndertakingDoc";
import type { ConsentView } from "@/lib/portal/forms";

/**
 * THE CONSULTANT APPLICATION, filled in by the applicant: their details,
 * their company, its documents. Save to come back to it; Submit sends it to
 * SnZ Ventures. Posts to /api/portal/applicant.
 */

export type ApplicantDetails = {
  phone: string;
  address: string;
  city: string;
  country: string;
  companyName: string;
  companyRegistered: boolean | null;
  registrationNo: string;
  website: string;
  about: string;
};

const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-moss-400 px-6 text-[0.95rem] font-semibold text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";
const GHOST =
  "inline-flex min-h-11 items-center rounded-full border border-line px-5 text-[0.9rem] font-medium text-fg transition-colors hover:border-[var(--accent)] hover:text-accent disabled:opacity-50";

async function post(fields: Record<string, string | File | File[] | null>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((f) => form.append(k, f));
    else form.set(k, v);
  }
  const res = await fetch("/api/portal/applicant", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return { ok: Boolean(res.ok && data.ok), error: data.error };
}

export function ApplicantForm({
  initial,
  documents,
  storageOn,
}: {
  initial: ApplicantDetails;
  documents: { id: string; name: string }[];
  storageOn: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof ApplicantDetails, v: string | boolean) => setD((x) => ({ ...x, [k]: v }));

  async function send(action: "save" | "submit", e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setSaved(false);
    if (action === "submit" && !window.confirm("Send your application to SnZ Ventures? You cannot change it while it is being reviewed.")) return;
    setBusy(action);
    const r = await post({
      action,
      phone: d.phone,
      address: d.address,
      city: d.city,
      country: d.country,
      companyName: d.companyName,
      companyRegistered: d.companyRegistered == null ? "" : d.companyRegistered ? "yes" : "no",
      registrationNo: d.registrationNo,
      website: d.website,
      about: d.about,
      files,
    });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "That didn't save.");
    setFiles([]);
    if (action === "save") setSaved(true);
    router.refresh();
  }

  async function removeDoc(id: string) {
    if (!window.confirm("Remove this document?")) return;
    const r = await post({ action: "remove_doc", id });
    if (!r.ok) return setError(r.error ?? "That didn't work.");
    router.refresh();
  }

  const field = (k: keyof ApplicantDetails, label: string, opts: { type?: string; wide?: boolean; placeholder?: string; required?: boolean } = {}) => (
    <label className={opts.wide ? "block sm:col-span-2" : "block"}>
      <span className="field-label">
        {label}
        {opts.required && <span className="text-danger"> *</span>}
      </span>
      <input
        type={opts.type ?? "text"}
        value={String(d[k] ?? "")}
        onChange={(e) => set(k, e.target.value)}
        placeholder={opts.placeholder}
        className="field"
      />
    </label>
  );

  return (
    <form onSubmit={(e) => send("submit", e)} className="space-y-7">
      <section>
        <h2 className="label mb-3 text-accent">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", "Phone / WhatsApp", { type: "tel", required: true, placeholder: "+92 300 1234567" })}
          {field("address", "Address", { wide: true, required: true, placeholder: "Street and number" })}
          {field("city", "City", { required: true })}
          {field("country", "Country", { required: true })}
        </div>
      </section>

      <section>
        <h2 className="label mb-3 text-accent">Your company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("companyName", "Company name", { wide: true, required: true })}
          <fieldset className="sm:col-span-2">
            <legend className="field-label">
              Is the company registered?<span className="text-danger"> *</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                [true, "Yes, it is registered"],
                [false, "No, not registered"],
              ].map(([v, label]) => (
                <label
                  key={String(v)}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-[0.88rem] text-fg has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                >
                  <input
                    type="radio"
                    name="registered"
                    checked={d.companyRegistered === v}
                    onChange={() => set("companyRegistered", v as boolean)}
                    className="accent-[var(--accent)]"
                  />
                  {label as string}
                </label>
              ))}
            </div>
          </fieldset>
          {d.companyRegistered && field("registrationNo", "Registration number")}
          {field("website", "Website (optional)", { placeholder: "https://" })}
          <label className="block sm:col-span-2">
            <span className="field-label">About your work (optional)</span>
            <textarea
              rows={4}
              value={d.about}
              onChange={(e) => set("about", e.target.value)}
              placeholder="Where you work, how many students you usually help, the countries you focus on."
              className="field min-h-0 py-3"
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="label mb-3 text-accent">Company documents</h2>
        <p className="mb-3 text-[0.85rem] text-muted">
          Registration certificate, tax number, or anything that shows your company. PDF, image or Word, up to 15 MB each.
          {d.companyRegistered ? " Required for a registered company." : ""}
        </p>
        {documents.length > 0 && (
          <ul className="mb-3 divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-line">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.88rem]">
                <a href={`/api/portal/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="truncate text-fg underline-offset-4 hover:text-accent hover:underline">
                  {doc.name}
                </a>
                <button type="button" onClick={() => removeDoc(doc.id)} className="text-[0.8rem] text-muted hover:text-danger">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {storageOn ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] px-5 py-6 text-center hover:border-[var(--accent)]">
            <span className="text-[0.9rem] text-fg">{files.length ? files.map((f) => f.name).join(", ") : "Choose documents"}</span>
            <span className="text-[0.75rem] text-faint">They are uploaded when you save or submit.</span>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/*"
              className="sr-only"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
        ) : (
          <p className="note-warn p-3 text-[0.85rem]">Document upload is not available right now. You can still send your application.</p>
        )}
      </section>

      {error && (
        <p role="alert" className="note-danger p-3 text-[0.88rem]">
          {error}
        </p>
      )}
      {saved && <p className="text-[0.88rem] text-ok">Saved. You can come back and finish it later.</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy !== null} className={PRIMARY}>
          {busy === "submit" ? "Sending…" : "Submit application"}
        </button>
        <button type="button" onClick={() => send("save")} disabled={busy !== null} className={GHOST}>
          {busy === "save" ? "Saving…" : "Save and finish later"}
        </button>
      </div>
    </form>
  );
}

/** The applicant signs the consultant consent the super admin sent. */
export function ApplicantSign({ consent, name }: { consent: ConsentView; name: string }) {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [signed, setSigned] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post({ action: "sign", id: consent.id, agree: agree ? "1" : "0", signedName: signed });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "That didn't go through.");
    router.refresh();
  }

  return (
    <form onSubmit={sign} className="space-y-4">
      <ConsentDoc consent={consent} />
      <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-line p-3.5 text-[0.9rem] text-fg">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        I have read and agree to the {consent.title} above.
      </label>
      <label className="block">
        <span className="field-label">Type your full name to sign</span>
        <input value={signed} onChange={(e) => setSigned(e.target.value)} placeholder={name} className="field" maxLength={160} />
      </label>
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !agree || signed.trim().length < 2} className={PRIMARY}>
        {busy ? "Signing…" : "Sign and send"}
      </button>
    </form>
  );
}

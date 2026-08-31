"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PAYMENT_CLAUSES,
  PAYMENT_CONSENT_TITLE,
  paymentDeclarationBody,
  formatAmount,
} from "@/lib/portal/payment-consent";
import { DetailsFields, PaymentFields, type Facts, type SetFact } from "./FeeFields";
import { cn } from "@/lib/utils";

/**
 * FORM A — PAYMENT AUTHORIZATION & DECLARATION.
 *
 * The student has already paid before they reach the portal: a query comes in,
 * we explain the process, the fee is paid upfront, and only then do they get a
 * sign-up link. So the very first thing here asks for the receipt of a payment
 * that has already happened, and nothing else opens until we have checked it.
 *
 * THE FIELDS ARE THE SOURCE DOCUMENT'S, NOT MINE. Both of its field sets are
 * here — identity and payment — with its labels, hints and optional/required
 * split. See the note in FeeFields.tsx. The one addition is the receipt step,
 * which the paper form has no equivalent of because paper is handed over in
 * person.
 *
 * WHY A DIALOG
 * It is the first thing after sign-in and the only thing that can happen until
 * it is done. A page would need every other route redirecting to it, and a
 * student who navigated away would face a portal of dead links. Here the
 * dashboard stays visible underneath — they can see what they are unlocking.
 *
 * It is dismissible. Not because the step is optional, but because someone
 * without their receipt to hand must be able to look around and message an
 * advisor. The lock is enforced on the server; this is only the way through it.
 */

type Step = "details" | "payment" | "receipt" | "read" | "sign";

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Your details" },
  { key: "payment", label: "The payment" },
  { key: "receipt", label: "Your receipt" },
  { key: "read", label: "Read it" },
  { key: "sign", label: "Sign" },
];

const EMPTY: Facts = {
  name: "", father: "", passport: "", nationality: "", dob: "",
  email: "", phone: "", city: "", address: "",
  university: "", programme: "", feeType: "", currency: "EUR", amount: "",
  method: "", txnRef: "", payDate: "",
  thirdParty: false, payerName: "", payerRelation: "",
};

export function FeeDialog({
  studentName,
  studentEmail,
  open,
  onClose,
  rejectionNote,
}: {
  studentName: string;
  studentEmail: string;
  open: boolean;
  onClose: () => void;
  rejectionNote?: string | null;
}) {
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Seeded from the account, because the person filling this in is the person
    who signed up — asking them to retype their own name and email under a
    heading that says "as on passport" invites a mismatch between the two. They
    can still correct either; the passport is what the declaration must match.
  */
  const [f, setF] = useState<Facts>({ ...EMPTY, name: studentName, email: studentEmail });
  const set: SetFact = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const [receipt, setReceipt] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const idx = STEPS.findIndex((s) => s.key === step);
  const amountLabel = formatAmount(f.amount, f.currency);

  /* --------------------------------------------------------- step gating */

  function problem(): string | null {
    if (step === "details") {
      if (!f.name.trim()) return "Enter your full name.";
      if (!f.passport.trim()) return "Enter your passport number.";
      if (!f.nationality.trim()) return "Enter your nationality.";
      if (!f.dob) return "Enter your date of birth.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()))
        return "Enter a valid email address.";
      if (!f.phone.trim()) return "Enter a contact number.";
      if (!f.city.trim()) return "Enter your city and country.";
      return null;
    }
    if (step === "payment") {
      if (!f.university.trim()) return "Enter the institution name.";
      if (!f.feeType) return "Choose what the fee is for.";
      const n = Number(f.amount.replace(/,/g, ""));
      if (!isFinite(n) || n <= 0) return "Enter the amount as a number.";
      if (!f.method) return "Choose a payment method.";
      if (f.thirdParty && (!f.payerName.trim() || !f.payerRelation.trim()))
        return "Enter the payer's name and their relationship to you.";
      return null;
    }
    if (step === "receipt" && !receipt) return "Attach your payment receipt.";
    if (step === "read" && !agreed) return "Tick the box to confirm you have read it.";
    return null;
  }

  function next() {
    const bad = problem();
    setError(bad);
    if (bad) return;
    setStep(STEPS[idx + 1].key);
  }

  async function submit() {
    setError(null);
    if (f.name.trim().length < 2) return setError("Type your full name as your signature.");
    if (!signature) return setError("Draw your signature in the box.");
    if (!receipt) return setError("Attach your payment receipt.");

    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append("receipt", receipt);
      fd.append("signaturePng", signature);
      fd.append("signedName", f.name);

      const res = await fetch("/api/portal/fee", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't submit that. Please try again.");
        setBusy(false);
        return;
      }
      /*
        A full load, not a router refresh. The whole navigation changes shape
        when this succeeds — the stage moves and nav items change state — and
        re-reading it from the server is more honest than patching a cached
        tree rendered for a student at a different stage.
      */
      window.location.assign("/portal/student?fee=submitted");
    } catch {
      setError("Network problem. Please check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-navy-950/80 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fee-title"
        className="tone-deep relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]"
      >
        <div className="shrink-0 border-b border-line px-5 py-4 sm:px-8 sm:py-5">
          <p className="label text-accent">
            Step {idx + 1} of {STEPS.length} · {STEPS[idx].label}
          </p>
          <h2 id="fee-title" className="d-3 mt-1.5 text-fg-strong">
            {PAYMENT_CONSENT_TITLE}
          </h2>
          <div aria-hidden className="mt-3 flex gap-1">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= idx ? "bg-moss-400" : "bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]"
                )}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
          {rejectionNote && idx === 0 && (
            <p className="mb-5 rounded-[var(--radius-sm)] border border-red-500/45 bg-red-500/10 px-4 py-3 text-[0.9rem] leading-relaxed text-[#B42318] [html[data-theme=dark]_&]:text-red-200">
              <strong>Your last submission was returned.</strong> {rejectionNote}
            </p>
          )}

          {step === "details" && <DetailsFields f={f} set={set} />}
          {step === "payment" && <PaymentFields f={f} set={set} />}
          {step === "receipt" && <Receipt file={receipt} onFile={setReceipt} />}
          {step === "read" && (
            <ReadIt
              facts={{
                name: f.name,
                passport: f.passport,
                nationality: f.nationality,
                city: f.city,
                university: f.university,
                programme: f.programme || null,
                feeType: f.feeType,
                amountLabel,
                method: f.method,
                payDate: f.payDate || null,
                thirdParty: f.thirdParty,
                payerName: f.payerName || null,
                payerRelation: f.payerRelation || null,
              }}
              agreed={agreed}
              onAgree={setAgreed}
            />
          )}
          {step === "sign" && (
            <Sign name={f.name} signature={signature} onSignature={setSignature} />
          )}

          {error && (
            <p
              role="alert"
              className="mt-5 rounded-[var(--radius-sm)] border border-red-500/45 bg-red-500/10 px-4 py-3 text-[0.9rem] font-medium leading-relaxed text-[#B42318] [html[data-theme=dark]_&]:text-red-200"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-5 py-4 sm:px-8">
          {idx > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setStep(STEPS[idx - 1].key);
              }}
              className="label min-h-11 px-1 text-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="label min-h-11 px-1 text-muted transition-colors hover:text-fg"
            >
              Later
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={step === "sign" ? submit : next}
            className="label ml-auto inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:opacity-50"
          >
            {busy
              ? "Submitting…"
              : step === "sign"
                ? "Sign and submit"
                : step === "receipt"
                  ? "Review the document"
                  : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ receipt ═ */

function Receipt({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <p className="text-[0.9rem] leading-relaxed text-muted">
        A photograph or PDF of the transfer you have already made. It must
        clearly show the <span className="text-fg">amount</span>, the{" "}
        <span className="text-fg">date</span> and the{" "}
        <span className="text-fg">reference number</span> — those are the three
        things we check against our bank.
      </p>

      <button
        type="button"
        onClick={() => input.current?.click()}
        className="w-full rounded-[var(--radius-md)] border border-dashed border-line-strong px-6 py-10 text-center transition-colors hover:border-moss-400/70"
      >
        <span className="block text-[0.95rem] font-semibold text-fg">
          {file ? "Choose a different file" : "Choose your receipt"}
        </span>
        <span className="mt-1 block text-[0.82rem] text-faint">
          PDF or image · up to 15 MB
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setErr(null);
          if (!f) return;
          if (f.size > 15 * 1024 * 1024) return setErr("That file is over 15 MB. Please compress it.");
          onFile(f);
        }}
      />

      {file && (
        <p className="rounded-[var(--radius-sm)] border border-moss-400/45 bg-moss-400/10 px-4 py-3 text-[0.88rem] text-fg">
          Attached: <span className="font-semibold">{file.name}</span>
        </p>
      )}
      {err && <p className="text-[0.85rem] text-red-400">{err}</p>}

      <p className="text-[0.8rem] leading-relaxed text-faint">
        Your receipt goes into private document storage, never the public site,
        and is only reachable through an authorised link that expires.
      </p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ read & sign ═ */

function ReadIt({
  facts,
  agreed,
  onAgree,
}: {
  facts: Parameters<typeof paymentDeclarationBody>[0];
  agreed: boolean;
  onAgree: (v: boolean) => void;
}) {
  const body = paymentDeclarationBody(facts);
  return (
    <div className="space-y-5">
      {/*
        The declaration is set on a WHITE sheet in both themes. It is a legal
        document that will be printed and filed, and one that changes colour
        with a UI preference reads as part of the interface rather than as the
        thing being agreed to.
      */}
      <div className="rounded-[var(--radius-md)] border border-line bg-white p-6 text-[#101b40] sm:p-8">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#3e7a22]">Form A</p>
        <h3 className="mt-1 text-[1.25rem] font-extrabold tracking-[-0.03em]">
          {PAYMENT_CONSENT_TITLE}
        </h3>

        <dl className="mt-5 grid gap-3 border-l-2 border-[#72c43c] bg-[#f4f6fa] p-4 sm:grid-cols-2">
          {[
            ["Student", facts.name],
            ["Passport number", facts.passport],
            ["Institution", facts.university],
            ["Amount authorised", facts.amountLabel],
            ["Purpose", facts.feeType],
            ["Method", facts.method],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[#8b93a8]">
                {k}
              </dt>
              <dd className="mt-0.5 break-words text-[0.8rem] font-bold">{v || "—"}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 space-y-3 text-[0.82rem] leading-[1.75] text-[#2b3350]">
          {body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="pt-1 font-bold text-[#101b40]">I confirm that:</p>
          <ol className="space-y-2">
            {PAYMENT_CLAUSES.map((c, i) => (
              <li key={i} className="relative pl-7">
                <span className="absolute left-0 top-0.5 text-[0.65rem] font-bold text-[#3e7a22]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {c}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-line p-4 transition-colors hover:border-line-strong">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-moss-400"
          checked={agreed}
          onChange={(e) => onAgree(e.target.checked)}
        />
        <span className="text-[0.88rem] leading-relaxed text-fg">
          I have read this declaration in full and I agree to its terms.
          <span className="mt-1 block text-[0.82rem] text-muted">
            Ticking this has the same effect as signing it by hand.
          </span>
        </span>
      </label>
    </div>
  );
}

function Sign({
  name,
  signature,
  onSignature,
}: {
  name: string;
  signature: string | null;
  onSignature: (v: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<{ x: number; y: number }[][]>([]);
  const drawing = useRef(false);
  const dpr = useRef(1);

  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
    ctx.clearRect(0, 0, c.width / dpr.current, c.height / dpr.current);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#101b40";
    ctx.lineWidth = 2.1;
    for (const s of strokes.current) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length - 1; i++) {
        const m = { x: (s[i].x + s[i + 1].x) / 2, y: (s[i].y + s[i + 1].y) / 2 };
        ctx.quadraticCurveTo(s[i].x, s[i].y, m.x, m.y);
      }
      ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
      ctx.stroke();
    }
  }, []);

  /*
    A canvas sized in CSS pixels on a 3x screen is a blurred signature on a
    legal document, so it is sized to devicePixelRatio and redrawn on resize.
    It also has no measurable size until laid out, which is why this runs in an
    effect rather than at first render.
  */
  const fit = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr.current = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    c.width = Math.round(r.width * dpr.current);
    c.height = Math.round(r.height * dpr.current);
    redraw();
  }, [redraw]);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const commit = () =>
    onSignature(strokes.current.length ? canvas.current!.toDataURL("image/png") : null);

  return (
    <div className="space-y-5">
      <p className="text-[0.9rem] leading-relaxed text-muted">
        Sign with your finger, a stylus or the mouse. The date, time, timezone
        and device are recorded with it as proof of signing, and a copy is filed
        with your submission.
      </p>

      <div className="rounded-[var(--radius-sm)] border border-line bg-raised p-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-faint">
          Signing as
        </p>
        <p className="mt-1 text-[1rem] font-semibold text-fg">{name || "—"}</p>
        <p className="mt-1 text-[0.78rem] text-faint">
          Taken from your details. Go back to step 1 to correct it.
        </p>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius-md)] border transition-colors",
          signature ? "border-moss-400" : "border-line"
        )}
      >
        <canvas
          ref={canvas}
          className="block h-[200px] w-full touch-none bg-white"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([at(e)]);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const s = strokes.current[strokes.current.length - 1];
            const p = at(e);
            const last = s[s.length - 1];
            if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 1.2) return;
            s.push(p);
            redraw();
          }}
          onPointerUp={() => {
            drawing.current = false;
            commit();
          }}
          onPointerLeave={() => {
            if (!drawing.current) return;
            drawing.current = false;
            commit();
          }}
        />
        <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
          <button
            type="button"
            onClick={() => {
              strokes.current.pop();
              redraw();
              commit();
            }}
            className="label min-h-9 rounded-[var(--radius-sm)] border border-line px-3 text-[0.7rem] text-muted transition-colors hover:text-fg"
          >
            Undo stroke
          </button>
          <button
            type="button"
            onClick={() => {
              strokes.current = [];
              redraw();
              onSignature(null);
            }}
            className="label min-h-9 rounded-[var(--radius-sm)] border border-line px-3 text-[0.7rem] text-muted transition-colors hover:text-fg"
          >
            Clear
          </button>
          <span className="ml-auto text-[0.75rem] text-faint">
            {signature ? "Signed" : "Sign above"}
          </span>
        </div>
      </div>
    </div>
  );
}

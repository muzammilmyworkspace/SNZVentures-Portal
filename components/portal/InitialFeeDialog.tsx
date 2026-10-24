"use client";

import { useEffect, useState } from "react";
import {
  PAYMENT_TERMS,
  PLAN_LABEL,
  bankReady,
  money,
  scheduleFor,
  type PaymentSettings,
  type PlanKey,
} from "@/lib/portal/payment-plan";
import { cn } from "@/lib/utils";

/**
 * BEFORE THE RECEIPT: how the student will pay, what to pay now, and the
 * terms they accept.
 *
 *   1. Plan     one-time or installments, each with its phases and amounts
 *   2. Voucher  the initial process fee, AdmitsFair's bank details and the
 *               reference to quote (their student ID)
 *   3. Terms    a pop-up: the fee is non-refundable, what happens next. The
 *               plan is saved only when they accept.
 *
 * Then the existing payment form (FeeDialog) opens for the receipt, with the
 * fee already filled in.
 */
export function InitialFeeDialog({
  open,
  onClose,
  onReady,
  settings,
  currentPlan,
  studentCode,
}: {
  open: boolean;
  onClose: () => void;
  /** Called once the plan is saved and the terms accepted. */
  onReady: (plan: PlanKey) => void;
  settings: PaymentSettings;
  currentPlan: PlanKey | null;
  studentCode: string;
}) {
  const [step, setStep] = useState<"plan" | "voucher">("plan");
  const [plan, setPlan] = useState<PlanKey | null>(currentPlan);
  const [termsOpen, setTermsOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) (termsOpen ? setTermsOpen(false) : onClose());
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, termsOpen, onClose]);

  if (!open) return null;

  const c = settings.currency;
  const ready = bankReady(settings);

  async function accept() {
    if (!plan || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/payment-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, acceptTerms: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't work. Please try again.");
        setBusy(false);
        return;
      }
      setBusy(false);
      setTermsOpen(false);
      onReady(plan);
    } catch {
      setError("Network problem. Please try again.");
      setBusy(false);
    }
  }

  const primary =
    "font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] ml-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50";

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
        aria-labelledby="initial-fee-title"
        className="tone-deep relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]"
      >
        <div className="shrink-0 border-b border-line px-5 py-4 sm:px-8 sm:py-5">
          <p className="label text-accent">Step {step === "plan" ? 1 : 2} of 2 · {step === "plan" ? "Payment plan" : "Fee voucher"}</p>
          <h2 id="initial-fee-title" className="d-3 mt-1.5 text-fg-strong">
            Start your initial process
          </h2>
          <div aria-hidden className="mt-3 flex gap-1">
            {[0, 1].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= (step === "plan" ? 0 : 1) ? "bg-moss-400" : "bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]",
                )}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
          {step === "plan" && (
            <div className="space-y-4">
              <p className="text-[0.92rem] leading-relaxed text-muted">
                Your first step is the <span className="text-fg">initial process</span>: we verify your documents and apply to
                universities for you. Choose how you would like to pay. The initial fee is the same on both plans.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["one_time", "installments"] as PlanKey[]).map((key) => {
                  const phases = scheduleFor(key, settings);
                  const total = phases.reduce((n, p) => n + p.amount, 0);
                  const selected = plan === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPlan(key)}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col justify-start rounded-[var(--radius-md)] border p-4 text-left transition-colors",
                        selected ? "border-moss-400 bg-moss-400/10" : "border-line hover:border-[color-mix(in_srgb,var(--fg)_30%,transparent)]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-[family-name:var(--font-display)] text-[1.05rem] font-semibold text-fg-strong">{PLAN_LABEL[key]}</span>
                        <span
                          className={cn(
                            "h-4 w-4 shrink-0 rounded-full border-2",
                            selected ? "border-moss-400 bg-moss-400" : "border-[color-mix(in_srgb,var(--fg)_35%,transparent)]",
                          )}
                        />
                      </span>
                      <ol className="mt-3 space-y-2">
                        {phases.map((p, i) => (
                          <li key={p.key} className="flex items-baseline justify-between gap-3 text-[0.88rem]">
                            <span className="text-muted">
                              <span className="text-fg">{i + 1}. {p.label}</span> — {p.when}
                            </span>
                            <span className="shrink-0 font-semibold text-fg-strong">{money(p.amount, c)}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-3 border-t border-line pt-2 text-right text-[0.8rem] text-muted">Total {money(total, c)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "voucher" && plan && (
            <div className="space-y-5">
              <p className="text-[0.92rem] leading-relaxed text-muted">
                Pay the initial process fee to the AdmitsFair account below, then upload your receipt in the next step.
              </p>
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-line">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-moss-400/10 px-5 py-4">
                  <div>
                    <p className="label text-accent">Fee voucher · {PLAN_LABEL[plan]}</p>
                    <p className="mt-1 text-[0.9rem] text-fg">Initial process fee</p>
                  </div>
                  <p className="font-[family-name:var(--font-display)] text-[1.8rem] font-semibold text-fg-strong">{money(settings.initialFee, c)}</p>
                </div>
                {ready ? (
                  <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-[0.9rem] sm:grid-cols-2">
                    {[
                      ["Account title", settings.bank.accountTitle],
                      ["Bank", settings.bank.bankName],
                      ["IBAN", settings.bank.iban],
                      ["Account number", settings.bank.accountNumber],
                      ["SWIFT / BIC", settings.bank.swift],
                      ["Payment reference", studentCode],
                    ]
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[0.78rem] text-muted">{k}</dt>
                          <dd className="mt-0.5 font-mono text-[0.95rem] break-all text-fg-strong">{v}</dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  <p className="px-5 py-4 text-[0.9rem] text-warn">
                    Our bank details are being updated. Please message us for the account to pay into, and quote your student ID{" "}
                    <span className="font-mono text-fg-strong">{studentCode}</span>.
                  </p>
                )}
                {settings.bank.note && <p className="border-t border-line px-5 py-3 text-[0.85rem] text-muted">{settings.bank.note}</p>}
              </div>
              <p className="text-[0.85rem] leading-relaxed text-muted">
                Write your student ID <span className="font-mono text-fg">{studentCode}</span> as the payment reference, so we can
                match your transfer quickly.
              </p>
            </div>
          )}

          {error && !termsOpen && (
            <p role="alert" className="mt-5 rounded-[var(--radius-sm)] border border-red-500/45 bg-red-500/10 px-4 py-3 text-[0.9rem] text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => (step === "voucher" ? setStep("plan") : onClose())}
            className="label min-h-11 px-1 text-muted transition-colors hover:text-fg"
          >
            {step === "voucher" ? "Back" : "Later"}
          </button>
          {step === "plan" ? (
            <button type="button" disabled={!plan} onClick={() => setStep("voucher")} className={primary}>
              Continue
            </button>
          ) : (
            <button type="button" onClick={() => (setAgreed(false), setError(null), setTermsOpen(true))} className={primary}>
              I have paid — upload my receipt
            </button>
          )}
        </div>

        {termsOpen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-950/70 p-3 backdrop-blur-sm sm:p-6">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="terms-title"
              className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-xl"
            >
              <div className="border-b border-line px-5 py-4">
                <h3 id="terms-title" className="font-[family-name:var(--font-display)] text-[1.15rem] font-semibold text-fg-strong">
                  Terms and conditions
                </h3>
                <p className="mt-1 text-[0.85rem] text-muted">Please read before you continue.</p>
              </div>
              <ol className="min-h-0 flex-1 list-decimal space-y-2.5 overflow-y-auto py-4 pr-5 pl-10 text-[0.9rem] leading-relaxed text-fg">
                {PAYMENT_TERMS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
              <div className="border-t border-line px-5 py-4">
                <label className="flex items-start gap-3 text-[0.9rem] text-fg">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
                  <span>
                    I have read and accept these terms. I understand the initial process fee of{" "}
                    <strong>{money(settings.initialFee, c)}</strong> is <strong>non-refundable</strong>.
                  </span>
                </label>
                {error && (
                  <p role="alert" className="mt-3 text-[0.85rem] text-danger">
                    {error}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-3">
                  <button type="button" onClick={() => setTermsOpen(false)} className="label min-h-11 px-1 text-muted hover:text-fg">
                    Cancel
                  </button>
                  <button type="button" disabled={!agreed || busy} onClick={accept} className={primary}>
                    {busy ? "Saving…" : "Accept and continue"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

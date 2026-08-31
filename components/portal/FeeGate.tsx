"use client";

import { useEffect, useState } from "react";
import { FeeDialog } from "@/components/portal/FeeDialog";
import type { StudentStage } from "@/lib/portal/stage";

/**
 * The banner above the student dashboard, and the dialog it opens.
 *
 * WHY THE DIALOG DOES NOT SIMPLY AUTO-OPEN AND STAY OPEN
 * The fee step is compulsory, but a modal that cannot be closed is a trap —
 * and a student who has not got their receipt to hand needs to be able to look
 * around, message an advisor and come back. So it opens on arrival, closes
 * freely, and the banner underneath keeps the way back visible. The lock is
 * enforced on the server; nothing here is load-bearing for access.
 *
 * It does NOT reopen on every navigation. Auto-opening once per visit is a
 * prompt; auto-opening every time someone returns to the dashboard is nagging,
 * and people learn to dismiss it without reading.
 */
export function FeeGate({
  stage,
  rejectionNote,
  studentName,
  lockedPath,
  justSubmitted,
}: {
  stage: StudentStage;
  rejectionNote: string | null;
  studentName: string;
  lockedPath: string | null;
  justSubmitted: boolean;
}) {
  const needsAction = stage === "fee_due" || stage === "fee_rejected";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!needsAction) return;
    /*
      Once per browser session, not once per page load. `sessionStorage`
      because the prompt should return tomorrow — this is not a preference
      being remembered, it is one nudge per visit.
    */
    try {
      const seen = sessionStorage.getItem("snz_fee_prompt");
      if (seen) return;
      sessionStorage.setItem("snz_fee_prompt", "1");
    } catch {
      // Private browsing refuses storage. Opening once is the right fallback.
    }
    const t = window.setTimeout(() => setOpen(true), 450);
    return () => window.clearTimeout(t);
  }, [needsAction]);

  return (
    <>
      {justSubmitted && stage === "fee_review" && (
        <Note tone="ok" title="Receipt received — thank you.">
          We&rsquo;re checking it against our records now. This usually takes one
          working day, and we&rsquo;ll email you the moment it&rsquo;s done.
        </Note>
      )}

      {lockedPath && needsAction && (
        <Note tone="warn" title="That part of your portal isn't open yet.">
          It unlocks as soon as your fee is verified.
        </Note>
      )}

      {stage === "fee_due" && (
        <Note
          tone="action"
          title="Start with your fee verification"
          cta={{ label: "Verify my fee", onClick: () => setOpen(true) }}
        >
          Your application form, documents and the rest of your file open once
          we&rsquo;ve confirmed your payment. It takes about five minutes and you
          will need your transfer receipt.
        </Note>
      )}

      {stage === "fee_rejected" && (
        <Note
          tone="error"
          title="Your payment receipt needs another look"
          cta={{ label: "Resubmit", onClick: () => setOpen(true) }}
        >
          {rejectionNote ?? "Please submit your receipt again."}
        </Note>
      )}

      {stage === "fee_review" && !justSubmitted && (
        <Note tone="ok" title="We're checking your receipt.">
          Your file opens as soon as it&rsquo;s confirmed. We&rsquo;ll email you
          — there&rsquo;s nothing else to do right now.
        </Note>
      )}

      {stage === "consent_due" && (
        <Note
          tone="action"
          title="One step left"
          cta={{ label: "Open my application", href: "/portal/application" }}
        >
          Your application is submitted. The consent and undertaking is the last
          thing to sign.
        </Note>
      )}

      <FeeDialog
        studentName={studentName}
        open={open}
        onClose={() => setOpen(false)}
        rejectionNote={stage === "fee_rejected" ? rejectionNote : null}
      />
    </>
  );
}

/* ------------------------------------------------------------------ note */

const TONES = {
  ok: "border-moss-400/45 bg-moss-400/10",
  warn: "border-amber-400/45 bg-amber-400/10",
  error: "border-red-500/45 bg-red-500/10",
  action: "border-line bg-raised",
} as const;

function Note({
  tone,
  title,
  children,
  cta,
}: {
  tone: keyof typeof TONES;
  title: string;
  children: React.ReactNode;
  cta?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <div
      className={`mb-6 flex flex-col gap-4 rounded-[var(--radius-md)] border p-5 sm:flex-row sm:items-center ${TONES[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[0.98rem] font-semibold text-fg">{title}</p>
        <p className="mt-1 text-[0.88rem] leading-relaxed text-muted">{children}</p>
      </div>
      {cta &&
        (cta.href ? (
          <a
            href={cta.href}
            className="label inline-flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
          >
            {cta.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="label inline-flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
          >
            {cta.label}
          </button>
        ))}
    </div>
  );
}

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
  studentEmail,
  known,
  storageOn = true,
  lockedPath,
  justSubmitted,
}: {
  stage: StudentStage;
  rejectionNote: string | null;
  studentName: string;
  studentEmail: string;
  /** Details from registration, filled into the fee form. */
  known?: { phone: string; city: string; nationality: string };
  /** False when uploads cannot be accepted; the form says so before step one. */
  storageOn?: boolean;
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
          {/*
            Here too, and this is the more important of the two: the moment
            somebody sees "received" is the moment they realise they attached
            the wrong photograph.
          */}
          <ReplaceReceipt />
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
          <ReplaceReceipt />
        </Note>
      )}

      {/*
        THE MOMENT IT OPENS, SAID OUT LOUD.

        This stage rendered nothing at all. Verification is the one event in
        the whole flow the student has been waiting on, and the way they found
        out was that some sidebar items had stopped being grey — which is not
        news arriving, it is news having to be noticed. Somebody who signs in
        and sees no change concludes nothing happened, and writes to ask.
      */}
      {stage === "application" && (
        <Note
          tone="action"
          title="Your fee is verified — the rest of your portal is open"
          cta={{ label: "Start my application", href: "/portal/application" }}
        >
          Thank you. Your application form, documents and journey are all
          available now.
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
        studentEmail={studentEmail}
        known={known}
        storageOn={storageOn}
        open={open}
        onClose={() => setOpen(false)}
        rejectionNote={stage === "fee_rejected" ? rejectionNote : null}
      />
    </>
  );
}

/* ------------------------------------------------------------------ note */

const TONES = {
  ok: "border-moss-400/45 bg-moss-400/10 before:bg-moss-400",
  warn: "border-amber-400/45 bg-amber-400/10 before:bg-amber-400",
  error: "border-red-500/45 bg-red-500/10 before:bg-red-500",
  action: "border-line bg-[image:var(--panel-bg)] before:bg-[#6FA6F7]",
} as const;

/**
 * "I SENT THE WRONG SLIP."
 *
 * Reported by a student, and there was no answer: the form refuses a second
 * live submission — correctly, because two contradictory declarations must not
 * exist at once — so the only route was to wait for staff to reject the first.
 * A day, over a photograph.
 *
 * Behind a confirmation, because this retracts something they signed. The
 * wording says what actually happens to it rather than "are you sure": the
 * declaration is withdrawn and kept, not deleted, and they will be sending a
 * fresh one.
 */
function ReplaceReceipt() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replace() {
    if (
      !confirm(
        "Withdraw the receipt you sent and send a different one?\n\n" +
          "We have not checked it yet, so nothing is lost. Your withdrawn " +
          "submission stays on your file as a record."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/fee/withdraw", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't work.");
        setBusy(false);
        return;
      }
      /*
        A full load. The stage has moved back to fee_due, which changes the
        dashboard, the sidebar locks and the header chip — re-reading it from
        the server is more honest than patching a tree rendered for somebody
        at a different stage.
      */
      window.location.assign("/portal/student");
    } catch {
      setError("Network problem. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={replace}
        disabled={busy}
        className="mt-2 block text-[0.85rem] underline underline-offset-4 opacity-90 transition-opacity hover:opacity-100 disabled:opacity-50"
      >
        {busy ? "Withdrawing…" : "Sent the wrong receipt? Replace it"}
      </button>
      {error && (
        <span role="alert" className="mt-2 block text-[0.82rem] text-danger">
          {error}
        </span>
      )}
    </>
  );
}

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
      className={`portal-rise relative mb-6 flex flex-col gap-4 overflow-hidden rounded-[16px] border p-5 pl-6 shadow-[var(--panel-shadow)] before:absolute before:inset-y-0 before:left-0 before:w-1 sm:flex-row sm:items-center ${TONES[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-[family-name:var(--font-display)] text-[1.05rem] font-semibold text-fg-strong">{title}</p>
        <p className="mt-1 text-[0.88rem] leading-relaxed text-muted">{children}</p>
      </div>
      {cta &&
        (cta.href ? (
          <a
            href={cta.href}
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300"
          >
            {cta.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300"
          >
            {cta.label}
          </button>
        ))}
    </div>
  );
}

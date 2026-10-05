"use client";

import { useRouter } from "next/navigation";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { BroughtByTag, DateTag, SlipButton } from "./FeeBits";

/**
 * One student's payment declaration, and the two buttons that decide it.
 *
 * REJECTING REQUIRES A REASON, and the button stays disabled until there is
 * one. The API refuses a reasonless rejection too — this is the courtesy, that
 * is the rule — because the reason is the entire content of the email the
 * student receives. "There was a problem" produces a support thread asking
 * what the problem was, and a day lost on both sides.
 */
export function FeeReview(props: {
  id: string;
  student: string;
  userId?: string;
  avatarV?: number | null;
  email: string;
  amount: string;
  university: string;
  feeType: string;
  method: string;
  txnRef: string | null;
  payDate: string | null;
  thirdParty: boolean;
  payerName: string | null;
  payerRelation: string | null;
  signedName: string;
  passport: string | null;
  nationality: string | null;
  city: string | null;
  phone: string | null;
  submittedAt: string;
  receiptDocumentId: string | null;
  /** Their consultant, or null for a student who came directly. */
  consultantName?: string | null;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "verify" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "verified" | "rejected">(null);

  async function decide(action: "verify" | "reject") {
    setError(null);
    if (action === "reject" && note.trim().length < 5) {
      setError("Tell the student what was wrong — they cannot fix it otherwise.");
      return;
    }
    setBusy(action);
    try {
      const res = await fetch("/api/admin/fee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: props.id, action, note: note.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through.");
        setBusy(null);
        return;
      }
      setDone(action === "verify" ? "verified" : "rejected");
      // The queue above this row still shows the old count until the server
      // renders again.
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius-md)] border border-moss-400/45 bg-moss-400/10 p-4 text-[0.9rem] text-fg">
        <strong>{props.student}</strong> — {done}. The student has been emailed.
      </div>
    );
  }

  const facts: [string, string | null][] = [
    // Identity first: matching the receipt to a person is the check, and the
    // passport number is what an institution reconciles a transfer against.
    ["Passport", props.passport],
    ["Nationality", props.nationality],
    ["Residence", props.city],
    ["Phone", props.phone],
    ["Amount declared", props.amount],
    ["Institution", props.university],
    ["Purpose", props.feeType],
    ["Method", props.method],
    ["Reference", props.txnRef],
    ["Transfer date", props.payDate],
    [
      "Paid by",
      props.thirdParty
        ? `${props.payerName ?? "—"}${props.payerRelation ? ` (${props.payerRelation})` : ""}`
        : "The student",
    ],
    ["Signed as", props.signedName],
  ];

  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-raised p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar id={props.userId ?? props.id} name={props.student} photo={props.avatarV != null} v={props.avatarV} size="md" />
          <div className="min-w-0">
            <p className="text-[1rem] font-semibold text-fg">{props.student}</p>
            <p className="truncate text-[0.82rem] text-faint">{props.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BroughtByTag name={props.consultantName} />
          <DateTag iso={props.submittedAt} label="Sent" />
          <span className="pill pill-warn">Unverified</span>
          <SlipButton documentId={props.receiptDocumentId} end />
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-faint">
              {k}
            </dt>
            <dd className="mt-0.5 text-[0.9rem] font-medium text-fg">{v || "—"}</dd>
          </div>
        ))}
      </dl>

      {props.receiptDocumentId ? (
        <a
          href={`/api/portal/documents/${props.receiptDocumentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-accent transition-colors hover:border-moss-400/70"
        >
          Open the receipt
        </a>
      ) : (
        <p className="mt-4 text-[0.85rem] text-danger">
          No receipt is attached to this submission.
        </p>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <label className="field-label" htmlFor={`note-${props.id}`}>
          Note to the student{" "}
          <span className="font-normal normal-case tracking-normal text-faint">
            — required when returning it
          </span>
        </label>
        <textarea
          id={`note-${props.id}`}
          rows={2}
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The receipt shows EUR 100 but you declared EUR 150. Please send the correct one."
        />

        {error && (
          <p role="alert" className="mt-3 text-[0.85rem] font-medium text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => decide("verify")}
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
          >
            {busy === "verify" ? "Verifying…" : "Verify — open their application"}
          </button>
          <button
            type="button"
            disabled={busy !== null || note.trim().length < 5}
            onClick={() => decide("reject")}
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full border border-line px-5 text-muted transition-colors hover:border-red-400/50 hover:text-danger disabled:opacity-40"
          >
            {busy === "reject" ? "Returning…" : "Return for correction"}
          </button>
        </div>
      </div>
    </div>
  );
}

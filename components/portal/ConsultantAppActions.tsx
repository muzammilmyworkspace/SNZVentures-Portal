"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * The super admin's buttons on one consultant application: send the
 * consultant agreement, approve, or reject with a reason they are emailed.
 */
export function ConsultantAppActions({
  userId,
  name,
  status,
  consentActive,
}: {
  userId: string;
  name: string;
  status: string;
  /** Is a SnZ <-> consultant consent in use? Without one, approval needs no signature. */
  consentActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function act(action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/consultant-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't work.");
      setRejecting(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const open = status === "submitted" || status === "consent_sent" || status === "consent_signed";
  const canApprove = status === "consent_signed" || (status === "submitted" && !consentActive);
  const btn = "inline-flex min-h-10 items-center rounded-full px-4 text-[0.85rem] font-semibold transition-colors disabled:opacity-50";

  if (!open) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "submitted" && consentActive && (
          <button
            type="button"
            onClick={() => act("send_consent", `Send ${name} the consultant agreement to sign? They are emailed a link to the portal.`)}
            disabled={busy !== null}
            className={`${btn} bg-[var(--accent)] text-[#070B1A] hover:opacity-90`}
          >
            {busy === "send_consent" ? "Sending…" : "Send agreement to sign"}
          </button>
        )}
        {canApprove && (
          <button
            type="button"
            onClick={() => act("approve", `Approve ${name} as a consultant? Their account opens and they are emailed.`)}
            disabled={busy !== null}
            className={`${btn} bg-moss-400 text-[#070B1A] hover:bg-moss-300`}
          >
            {busy === "approve" ? "Approving…" : "Approve as consultant"}
          </button>
        )}
        {status === "consent_sent" && <span className="self-center text-[0.82rem] text-faint">Waiting for them to sign.</span>}
        <button
          type="button"
          onClick={() => {
            setRejecting(true);
            setError(null);
          }}
          disabled={busy !== null}
          className={`${btn} border border-line text-muted hover:border-red-400/60 hover:text-danger`}
        >
          Reject
        </button>
      </div>
      {error && !rejecting && (
        <p role="alert" className="text-[0.82rem] text-danger">
          {error}
        </p>
      )}

      {rejecting &&
        createPortal(
          <div className="fixed inset-0 z-[90] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Reject application">
            <button type="button" aria-label="Close" onClick={() => setRejecting(false)} className="absolute inset-0 bg-[rgb(4_8_20/0.72)] backdrop-blur-[3px]" />
            <div className="relative w-full max-w-md rounded-[18px] border border-line bg-[var(--panel-solid,#1B2645)] p-6 shadow-2xl">
              <h2 className="text-[1.1rem] font-semibold text-fg-strong">Reject {name}&apos;s application</h2>
              <p className="mt-1 text-[0.85rem] text-muted">They are emailed this reason, and can change their details and apply again.</p>
              <textarea autoFocus rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="field mt-4" placeholder="e.g. Please upload your company registration certificate." />
              {error && (
                <p role="alert" className="mt-2 text-[0.85rem] text-danger">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setRejecting(false)} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-muted hover:text-fg">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => act("reject")}
                  disabled={busy !== null || reason.trim().length < 5}
                  className="inline-flex min-h-10 items-center rounded-full bg-[#D9473F] px-4 text-[0.88rem] font-semibold text-white disabled:opacity-50"
                >
                  {busy === "reject" ? "Rejecting…" : "Reject and email"}
                </button>
              </div>
            </div>
          </div>,
          document.querySelector(".portal-shell") ?? document.body
        )}
    </div>
  );
}

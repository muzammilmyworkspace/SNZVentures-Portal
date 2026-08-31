"use client";

import {
  CONSENT_TITLE,
  CONSENT_PARTY,
  CONSENT_CLAUSES,
  CONSENT_CLOSING,
  CONSENT_CHECKBOX_LABEL,
  consentRuns,
} from "@/lib/portal/consent";

/**
 * THE STUDENT CONSENT & UNDERTAKING, shown at registration.
 *
 * THE TEXT IS ON SCREEN IN FULL, not behind a link. An agreement someone has
 * to go and find is one nobody reads, and "I agree to the terms" with the terms
 * elsewhere is exactly the pattern that makes a consent worth nothing when it
 * is later disputed. It is four short clauses; there is room for them.
 *
 * IT SCROLLS RATHER THAN COLLAPSES. A fixed height with its own scrollbar
 * signals honestly that there is a document here and shows where it ends,
 * where a collapsed panel invites ticking the box without opening it.
 *
 * THE TYPED NAME IS THE SIGNATURE. The paper form has a signature line, and a
 * bare checkbox loses the one thing that makes the record identify a person
 * rather than a session. Typing your own name is a deliberate act in a way
 * that clicking is not.
 *
 * STUDENTS ONLY — the caller decides. The undertaking is about admission and
 * student visa processing, so putting it in front of a job seeker or a business
 * would be asking them to agree to terms that do not apply to them.
 */
export function ConsentNotice({
  signedName,
  onSignedName,
  accepted,
  onAccepted,
  invalid,
}: {
  signedName: string;
  onSignedName: (v: string) => void;
  accepted: boolean;
  onAccepted: (v: boolean) => void;
  invalid?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[0.95rem] font-semibold text-fg-strong">{CONSENT_TITLE}</p>
        <p className="mt-0.5 text-[0.75rem] text-faint">{CONSENT_PARTY}</p>
      </div>

      <div className="rail max-h-56 space-y-3 overflow-y-auto px-4 py-4">
        {CONSENT_CLAUSES.map((clause, i) => (
          <p key={i} className="text-[0.85rem] leading-relaxed text-muted">
            {consentRuns(clause).map((run, j) =>
              run.strong ? (
                <strong key={j} className="font-semibold text-fg">
                  {run.text}
                </strong>
              ) : (
                <span key={j}>{run.text}</span>
              )
            )}
          </p>
        ))}
        <p className="border-t border-line pt-3 text-[0.85rem] leading-relaxed text-muted">
          {CONSENT_CLOSING}
        </p>
      </div>

      <div className="space-y-4 border-t border-line px-4 py-4">
        <div>
          <label htmlFor="signedName" className="field-label">
            Type your full name as signature
            <span
              aria-hidden
              className="ml-1 font-semibold text-[#D92D20] dark:text-red-300 [html[data-theme=dark]_&]:text-red-300"
            >
              *
            </span>
            <span className="sr-only">(required)</span>
          </label>
          <input
            id="signedName"
            type="text"
            value={signedName}
            onChange={(e) => onSignedName(e.target.value)}
            autoComplete="name"
            className="field"
            aria-invalid={invalid && !signedName.trim() ? true : undefined}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-[0.85rem] leading-relaxed text-fg">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAccepted(e.target.checked)}
            aria-invalid={invalid && !accepted ? true : undefined}
            /*
              A real checkbox, not a styled div. `accent-color` themes the
              native control in every current browser, which keeps the keyboard
              behaviour, the screen-reader announcement and the platform's own
              focus ring — all things a re-implementation loses and then has to
              rebuild worse.
            */
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span>{CONSENT_CHECKBOX_LABEL}</span>
        </label>
      </div>
    </div>
  );
}

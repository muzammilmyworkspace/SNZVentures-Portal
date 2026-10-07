"use client";

import { useRef, useState } from "react";
import {
  CONSENT_TITLE,
  CONSENT_PARTY,
  CONSENT_CLAUSES,
  CONSENT_CLOSING,
  CONSENT_VERSION,
} from "@/lib/portal/consent";
import { cn } from "@/lib/utils";
import type { ConsentView } from "@/lib/portal/forms";

/**
 * FORM B — the Student Consent & Undertaking, shown in full before signing.
 *
 * IT SCROLLS IN ITS OWN BOX rather than running down the page. Four clauses at
 * full length push the tick and the signature below the fold, and a person who
 * has to hunt for the control learns to scroll past the words to find it —
 * which is the opposite of what a consent screen is for. Here the document
 * scrolls and the signature stays in view.
 *
 * The read indicator is a PROMPT, not a gate. Disabling the tick until someone
 * reaches the bottom teaches them to drag the scrollbar down without reading;
 * it converts a legal acknowledgement into a dexterity test. So it says where
 * they are and leaves the choice with them, which is also what the paper form
 * does.
 *
 * The bold phrases are the ones the paper document sets in bold — the parts a
 * person most needs to have actually read, emphasised for the same reason, not
 * for decoration.
 */

function Clause({ text, emphasis }: { text: string; emphasis: string[] }) {
  if (!emphasis.length) return <>{text}</>;

  // Longest first, so a phrase contained inside another does not split it.
  const ordered = [...emphasis].sort((a, b) => b.length - a.length);
  let parts: (string | { bold: string })[] = [text];

  for (const phrase of ordered) {
    parts = parts.flatMap((part) => {
      if (typeof part !== "string") return [part];
      const at = part.indexOf(phrase);
      if (at === -1) return [part];
      return [part.slice(0, at), { bold: phrase }, part.slice(at + phrase.length)];
    });
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <strong key={i} className="font-semibold text-fg">
            {part.bold}
          </strong>
        )
      )}
    </>
  );
}

/** One consent document, scrolling in its own box. */
export function ConsentDoc({ consent }: { consent?: ConsentView | null }) {
  const [readToEnd, setReadToEnd] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  // Written or uploaded by the super admin; otherwise the built-in wording.
  const custom = consent?.custom ? consent : null;

  return (
    <div className="rounded-[var(--radius-md)] border border-line">
      <header className="border-b border-line px-5 py-4">
        {custom?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={custom.logoUrl} alt="Logo" className="mb-3 max-h-16 w-auto max-w-[220px] object-contain" />
        )}
        <h3 className="text-[1.05rem] font-bold tracking-[-0.01em] text-fg-strong">
          {custom ? custom.title : CONSENT_TITLE}
        </h3>
        <p className="mt-1 text-[0.82rem] text-muted">
          Between you and {consent?.party ?? CONSENT_PARTY}
        </p>
        {custom?.fileUrl && (
          <a
            href={custom.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => !custom.body && setReadToEnd(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[0.82rem] font-medium text-fg hover:border-[var(--accent)] hover:text-accent"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3" />
            </svg>
            Open the consent document{custom.fileName ? ` (${custom.fileName})` : ""}
          </a>
        )}
      </header>

      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true);
        }}
        className="max-h-[45vh] overflow-y-auto overscroll-contain px-5 py-4"
      >
        {custom ? (
          custom.body ? (
            <div className="space-y-3">
              {custom.body.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-wrap text-[0.88rem] leading-relaxed text-muted">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[0.88rem] leading-relaxed text-muted">
              Open the document above and read it in full before you sign.
            </p>
          )
        ) : (
        <ol className="space-y-4">
          {CONSENT_CLAUSES.map((clause, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 font-mono text-[0.72rem] text-faint"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[0.88rem] leading-relaxed text-muted">
                <Clause text={clause.text} emphasis={clause.emphasis} />
              </p>
            </li>
          ))}
        </ol>
        )}

        <p className="mt-5 border-t border-line pt-4 text-[0.88rem] leading-relaxed text-fg">
          {CONSENT_CLOSING}
        </p>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="font-mono text-[0.68rem] text-faint">
          Version {custom ? custom.version : CONSENT_VERSION}
        </span>
        <span
          className={cn(
            "text-[0.75rem] font-medium transition-colors",
            readToEnd ? "text-ok" : "text-faint"
          )}
        >
          {readToEnd ? "Read to the end" : "Scroll to the end"}
        </span>
      </footer>
    </div>
  );
}

/**
 * The consent step of the application: SnZ Ventures' consent, and below it
 * the student's consultant's own, when they have one. The one tick and typed
 * name under them sign both, and both are recorded.
 */
export function UndertakingDoc({
  consent,
  partner = null,
}: {
  consent?: ConsentView | null;
  partner?: ConsentView | null;
}) {
  if (!partner) return <ConsentDoc consent={consent} />;
  return (
    <div className="space-y-4">
      <ConsentDoc consent={consent} />
      <ConsentDoc consent={partner} />
      <p className="rounded-[var(--radius-md)] border border-line px-4 py-3 text-[0.85rem] leading-relaxed text-fg">
        Ticking the box and typing your name below means you agree to <strong className="font-semibold">both</strong>{" "}
        documents above: SnZ Ventures&apos; and {partner.party}&apos;s.
      </p>
    </div>
  );
}

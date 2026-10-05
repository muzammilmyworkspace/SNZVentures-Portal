/**
 * Small pieces shared by the fee queue and its review card. No hooks, so they
 * render in server and client components alike.
 */

/** Who brought this student: their consultant, or "Direct" if nobody did. */
export function BroughtByTag({ name }: { name: string | null | undefined }) {
  return name ? (
    <span
      className="tip inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border border-[color-mix(in_srgb,var(--viz-1)_45%,transparent)] bg-[color-mix(in_srgb,var(--viz-1)_12%,transparent)] px-2.5 py-0.5 text-[0.75rem] font-semibold text-fg"
      data-tip="Came through this consultant"
      tabIndex={0}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="h-3 w-3 shrink-0">
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 13.5c.6-2.4 2.6-4 5-4s4.4 1.6 5 4" strokeLinecap="round" />
      </svg>
      <span className="truncate">{name}</span>
    </span>
  ) : (
    <span
      className="tip inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[0.75rem] font-semibold text-muted"
      data-tip="Signed up on the portal directly"
      tabIndex={0}
    >
      Direct
    </span>
  );
}

/** A date as a small tag: "5 Oct 2026". */
export function DateTag({ iso, label }: { iso: string | null; label?: string }) {
  if (!iso) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] px-2.5 py-0.5 text-[0.75rem] font-medium text-muted">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="h-3 w-3">
        <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
        <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" strokeLinecap="round" />
      </svg>
      {label && <span className="text-faint">{label}</span>}
      {new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
    </span>
  );
}

/** Opens the bank slip the student uploaded, in a new tab. */
export function SlipButton({ documentId, end = false }: { documentId: string | null; end?: boolean }) {
  const icon = (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3M5.5 8h5M5.5 10.5h5M5.5 13h3" strokeLinecap="round" />
    </svg>
  );
  if (!documentId) {
    return (
      <span
        tabIndex={0}
        aria-label="No bank slip attached"
        data-tip="No bank slip attached"
        className={`tip ${end ? "tip-end" : ""} icon-btn inline-flex cursor-not-allowed opacity-40`}
      >
        {icon}
      </span>
    );
  }
  return (
    <a
      href={`/api/portal/documents/${documentId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View the bank slip"
      data-tip="View bank slip"
      className={`tip ${end ? "tip-end" : ""} icon-btn inline-flex`}
    >
      {icon}
    </a>
  );
}

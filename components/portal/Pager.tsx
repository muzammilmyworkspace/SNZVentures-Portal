import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * PAGINATION — one component for every list in the portal.
 *
 * Link-based, so a page is a URL: bookmarkable, shareable, and it survives a
 * reload. Other query parameters (filters, search, sort, date range) are kept
 * when moving between pages. Numbers with ellipses, first / previous / next /
 * last as icon buttons, each with an accessible name and a hover tooltip.
 *
 * Use `paginate()` for lists that are already loaded in full, and pass the
 * server's own page/total for lists paged in SQL.
 */

export const PAGE_SIZE = 20;

export function pageFrom(raw: unknown): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages, total: rows.length, size };
}

function numbers(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

const ICONS = {
  first: "M11 4L6 9l5 5M6.5 4v10",
  prev: "M11 4L6 9l5 5",
  next: "M7 4l5 5-5 5",
  last: "M7 4l5 5-5 5M11.5 4v10",
};

export function Pager({
  page,
  pages,
  total,
  size = PAGE_SIZE,
  basePath,
  params = {},
  noun = "results",
  pageKey = "page",
  inset = false,
}: {
  page: number;
  pages: number;
  total: number;
  size?: number;
  basePath: string;
  params?: Record<string, string | string[] | undefined>;
  noun?: string;
  /** Query key for this list's page, when one URL holds two paged lists. */
  pageKey?: string;
  /** Inside a padded Panel: bleed to the panel's edges. */
  inset?: boolean;
}) {
  if (total === 0) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === pageKey || v === undefined) continue;
      q.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (p > 1) q.set(pageKey, String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);

  const IconLink = ({ to: p, kind, label, disabled }: { to: number; kind: keyof typeof ICONS; label: string; disabled: boolean }) => (
    <Link
      href={href(p)}
      aria-label={label}
      aria-disabled={disabled}
      data-tip={label}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        "tip grid h-9 w-9 place-items-center rounded-[10px] border border-line transition-colors",
        disabled ? "pointer-events-none opacity-35" : "text-muted hover:border-[var(--accent)] hover:text-accent"
      )}
    >
      <svg viewBox="0 0 18 18" fill="none" className="h-4 w-4" aria-hidden>
        <path d={ICONS[kind]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-3.5", inset && "-mx-5 -mb-5 mt-5")}>
      <p className="text-[0.85rem] text-muted">
        Showing <span className="num font-semibold text-fg">{from}</span>–<span className="num font-semibold text-fg">{to}</span> of{" "}
        <span className="num font-semibold text-fg">{total}</span> {noun}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1.5">
          <IconLink to={1} kind="first" label="First page" disabled={page <= 1} />
          <IconLink to={page - 1} kind="prev" label="Previous page" disabled={page <= 1} />
          {numbers(page, pages).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-faint" aria-hidden>
                …
              </span>
            ) : (
              <Link
                key={n}
                href={href(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
                className={cn(
                  "grid h-9 min-w-9 place-items-center rounded-[10px] px-2 font-mono text-[0.8rem] transition-colors",
                  n === page
                    ? "bg-moss-400 font-bold text-[#070B1A]"
                    : "border border-line text-muted hover:border-line-strong hover:text-fg"
                )}
              >
                {n}
              </Link>
            )
          )}
          <IconLink to={page + 1} kind="next" label="Next page" disabled={page >= pages} />
          <IconLink to={pages} kind="last" label="Last page" disabled={page >= pages} />
        </nav>
      )}
    </div>
  );
}

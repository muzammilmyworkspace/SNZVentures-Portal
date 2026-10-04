import Link from "next/link";
import { Tabs } from "@/components/portal/Pieces";
import { cn } from "@/lib/utils";

/**
 * SEARCH, FILTERS AND PAGINATION — all in the URL.
 *
 * Every control here is a link or a GET form, so the state lives in the query
 * string rather than in React. That is not a stylistic choice:
 *
 *   • the server can filter and paginate before any row leaves the database,
 *     which is the only version of this that survives ten thousand users;
 *   • a filtered view is bookmarkable and can be pasted to a colleague;
 *   • it survives a reload, a Back press and a restored tab.
 *
 * A client-side filter would have to fetch every row first, which is exactly
 * the thing being avoided.
 */

export type UserQuery = {
  q?: string;
  role?: string;
  status?: string;
  sort?: string;
  page?: string;
};

/** Build a URL that keeps the current filters and changes only what is given. */
export function usersHref(current: UserQuery, next: Partial<UserQuery>): string {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (!v || v === "all" || (k === "page" && v === "1")) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `/portal/admin/users?${qs}` : "/portal/admin/users";
}

export function UserFilters({
  current,
  counts,
}: {
  current: UserQuery;
  counts?: Partial<Record<string, number>>;
}) {
  const role = current.role ?? "all";
  const status = current.status ?? "all";

  return (
    <div className="mb-5 space-y-4">
      {/*
        A plain GET form. Submitting reloads the page with ?q=…, so search is
        done by Postgres over the whole table rather than by JavaScript over
        whatever happened to be downloaded.
      */}
      <form action="/portal/admin/users" method="get" className="flex flex-wrap gap-2">
        <label htmlFor="user-search" className="sr-only">
          Search users by name or email
        </label>
        <input
          id="user-search"
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="Search name or email…"
          className="field max-w-sm flex-1"
        />
        {/* Filters ride along so searching does not silently clear them. */}
        {role !== "all" && <input type="hidden" name="role" value={role} />}
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        {current.sort && <input type="hidden" name="sort" value={current.sort} />}
        <button
          type="submit"
          className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300"
        >
          Search
        </button>
        {current.q && (
          <Link
            href={usersHref(current, { q: "", page: "1" })}
            className="label inline-flex min-h-11 items-center px-3 text-faint transition-colors hover:text-fg"
          >
            Clear
          </Link>
        )}
      </form>

      <Tabs
        label="Filter by role"
        active={role}
        items={[
          { key: "all", label: "All", href: usersHref(current, { role: "all", page: "1" }), count: counts?.all },
          { key: "student", label: "Students", href: usersHref(current, { role: "student", page: "1" }), count: counts?.student },
          { key: "professional", label: "Job Seekers", href: usersHref(current, { role: "professional", page: "1" }), count: counts?.professional },
          { key: "business", label: "Businesses", href: usersHref(current, { role: "business", page: "1" }), count: counts?.business },
          { key: "admin", label: "Admins", href: usersHref(current, { role: "admin", page: "1" }) },
        ]}
      />

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "Any status" },
          { key: "active", label: "Active" },
          { key: "pending", label: "Pending" },
          { key: "suspended", label: "Suspended" },
        ].map((s) => (
          <Link
            key={s.key}
            href={usersHref(current, { status: s.key, page: "1" })}
            aria-current={status === s.key ? "true" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full px-4 text-[0.85rem] transition-colors",
              status === s.key
                ? "border border-moss-400/60 font-medium text-accent-ink"
                : "border border-line text-muted hover:border-moss-400/60 hover:text-fg"
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

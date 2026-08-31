import { requireAdmin } from "@/lib/auth/guard";
import { getUsersPageData, type UserSort } from "@/lib/db/repos/users";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { UserTable } from "@/components/portal/UserTable";
import { UserFilters, Pagination, type UserQuery } from "@/components/portal/UserFilters";

/**
 * USERS — paginated, searched and filtered BY THE DATABASE.
 *
 * This previously fetched up to 100 rows and filtered nothing server-side,
 * which is fine at six users and useless at a thousand: the page grows without
 * bound, the query gets slower every week, and eventually it is the request
 * that times out.
 *
 * Now a page is 25 rows, chosen and counted by Postgres. The controls live in
 * the query string so the filtering happens before any row leaves the database
 * — see components/portal/UserFilters.tsx for why that matters more than it
 * looks.
 */

const PAGE_SIZE = 25;

const SORTS: { key: UserSort; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name" },
  { key: "last_active", label: "Last active" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requireAdmin();
  const raw = await searchParams;

  const current: UserQuery = {
    q: typeof raw.q === "string" ? raw.q : undefined,
    role: typeof raw.role === "string" ? raw.role : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    sort: typeof raw.sort === "string" ? raw.sort : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  };

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Users" />
        <NotConfigured what="User management" />
      </>
    );
  }

  // Only ever a member of the known set — an ORDER BY assembled from a query
  // parameter is SQL injection with extra steps.
  const sort: UserSort = SORTS.some((s) => s.key === current.sort)
    ? (current.sort as UserSort)
    : "recent";

  const page = Math.max(1, Number(current.page) || 1);

  /*
    ONE query, not three behind a Promise.all.

    Three concurrent reads plus the layout's badges is a 504 on this stack —
    the third time that exact shape has caused one. See getUsersPageData for
    why concurrency does not help here and raising the pool makes it worse.
  */
  const result = await getUsersPageData({
    q: current.q,
    role: (current.role as never) ?? "all",
    status: (current.status as never) ?? "all",
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const { advisors, roleCounts } = result;

  return (
    <>
      <PortalHeading
        eyebrow="Operations"
        title="Users"
        lead="Search, suspend, assign an advisor or change a role. Every change is written to the audit log."
      />

      <UserFilters
        current={current}
        counts={{
          all: Object.values(roleCounts).reduce((a, b) => a + b, 0),
          student: roleCounts.student ?? 0,
          professional: roleCounts.professional ?? 0,
          business: roleCounts.business ?? 0,
        }}
      />

      <Panel padded={false}>
        {result.rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="search"
              title={current.q || current.role || current.status ? "No users match" : "No users yet"}
              body={
                current.q || current.role || current.status
                  ? "Try a different search, or clear the filters."
                  : "Accounts appear here as people register through the portal."
              }
              action={
                current.q || current.role || current.status
                  ? { label: "Clear filters", href: "/portal/admin/users" }
                  : undefined
              }
            />
          </div>
        ) : (
          <>
            <UserTable
              users={result.rows}
              advisors={advisors.map((a) => ({ id: a.id, name: a.name }))}
              actorRole={session.role}
              actorId={session.userId}
            />
            <Pagination
              current={current}
              page={result.page}
              pages={result.pages}
              total={result.total}
              showing={result.rows.length}
            />
          </>
        )}
      </Panel>

      <nav aria-label="Sort" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="label text-faint">Sort</span>
        {SORTS.map((s) => (
          <a
            key={s.key}
            href={`/portal/admin/users?${new URLSearchParams({
              ...(current.q ? { q: current.q } : {}),
              ...(current.role && current.role !== "all" ? { role: current.role } : {}),
              ...(current.status && current.status !== "all" ? { status: current.status } : {}),
              sort: s.key,
            })}`}
            aria-current={sort === s.key ? "true" : undefined}
            className={
              sort === s.key
                ? "inline-flex min-h-9 items-center text-[0.85rem] font-medium text-accent-ink"
                : "inline-flex min-h-9 items-center text-[0.85rem] text-muted transition-colors hover:text-fg"
            }
          >
            {s.label}
          </a>
        ))}
      </nav>
    </>
  );
}

import { getUsersPageData, GROUP_ROLES, type UserSort, type UserGroup } from "@/lib/db/repos/users";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { UserTable } from "@/components/portal/UserTable";
import { UserFilters, type UserQuery } from "@/components/portal/UserFilters";
import { Pager } from "@/components/portal/Pager";
import { HistoryDrawer } from "@/components/portal/HistoryDrawer";
import type { Role } from "@/lib/auth/types";

/**
 * EVERYONE ON THE PORTAL — paginated, searched and filtered BY THE DATABASE.
 *
 * Shared by Users (everyone, with All / Students / Consultants / Employees)
 * and Employees (fixed to staff). A page is 25 rows, chosen and counted by
 * Postgres; the controls live in the query string so filtering happens before
 * any row leaves the database.
 *
 * From any view: tick people, or take everyone in the view, and send them one
 * message (MessageBar); open the clock for a person's history.
 */

const PAGE_SIZE = 25;

const SORTS: { key: UserSort; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name" },
  { key: "last_active", label: "Last active" },
];

const GROUP_LABEL: Record<string, string> = {
  all: "this list",
  students: "Students",
  consultants: "Consultants",
  employees: "Employees",
};

export async function UsersView({
  raw,
  actorRole,
  actorId,
  basePath,
  fixedGroup,
  eyebrow,
  title,
  lead,
}: {
  raw: Record<string, string | string[] | undefined>;
  actorRole: Role;
  actorId: string;
  basePath: string;
  /** Pin the page to one group and hide the group tabs. */
  fixedGroup?: UserGroup;
  eyebrow: string;
  title: string;
  lead: string;
}) {
  const current: UserQuery = {
    q: typeof raw.q === "string" ? raw.q : undefined,
    role: fixedGroup ?? (typeof raw.role === "string" ? raw.role : undefined),
    status: typeof raw.status === "string" ? raw.status : undefined,
    sort: typeof raw.sort === "string" ? raw.sort : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  };

  // Only ever a member of the known set — an ORDER BY assembled from a query
  // parameter is SQL injection with extra steps.
  const sort: UserSort = SORTS.some((s) => s.key === current.sort) ? (current.sort as UserSort) : "recent";
  const page = Math.max(1, Number(current.page) || 1);

  // ONE query: rows, total, advisors and role counts together (see the repo).
  const result = await getUsersPageData({
    q: current.q,
    role: (current.role as never) ?? "all",
    status: (current.status as never) ?? "all",
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const { advisors, roleCounts } = result;
  const sum = (roles: string[]) => roles.reduce((n, r) => n + (roleCounts[r] ?? 0), 0);

  // This page as it is (filters, sort, page), for opening and closing history.
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && k !== "history") keep.set(k, v);
  const historyBase = `${basePath}?${keep.toString() ? `${keep.toString()}&` : ""}`;
  const historyId = typeof raw.history === "string" && /^[0-9a-f-]{36}$/i.test(raw.history) ? raw.history : null;
  const filtered = Boolean(current.q || (!fixedGroup && current.role && current.role !== "all") || current.status);

  return (
    <>
      <PortalHeading eyebrow={eyebrow} title={title} lead={lead} />
      {historyId && <HistoryDrawer userId={historyId} closeHref={historyBase.replace(/[?&]$/, "")} />}

      <UserFilters
        current={current}
        basePath={basePath}
        groupTabs={!fixedGroup}
        counts={{
          all: Object.values(roleCounts).reduce((a, b) => a + b, 0),
          students: sum(GROUP_ROLES.students),
          consultants: sum(GROUP_ROLES.consultants),
          employees: sum(GROUP_ROLES.employees),
        }}
      />

      <Panel padded={false}>
        {result.rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="search"
              title={filtered ? "Nobody matches" : "Nobody here yet"}
              body={filtered ? "Try a different search, or clear the filters." : "People appear here as they join the portal."}
              action={filtered ? { label: "Clear filters", href: basePath } : undefined}
            />
          </div>
        ) : (
          <>
            <UserTable
              users={result.rows}
              advisors={advisors.map((a) => ({ id: a.id, name: a.name }))}
              actorRole={actorRole}
              actorId={actorId}
              offset={(result.page - 1) * PAGE_SIZE}
              historyBase={historyBase}
              total={result.total}
              filter={{ role: current.role, status: current.status, q: current.q }}
              viewLabel={GROUP_LABEL[current.role ?? "all"] ?? "this list"}
            />
            <Pager
              page={result.page}
              pages={result.pages}
              total={result.total}
              size={PAGE_SIZE}
              basePath={basePath}
              params={raw}
              noun="people"
            />
          </>
        )}
      </Panel>

      <nav aria-label="Sort" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="label text-faint">Sort</span>
        {SORTS.map((s) => (
          <a
            key={s.key}
            href={`${basePath}?${new URLSearchParams({
              ...(current.q ? { q: current.q } : {}),
              ...(!fixedGroup && current.role && current.role !== "all" ? { role: current.role } : {}),
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

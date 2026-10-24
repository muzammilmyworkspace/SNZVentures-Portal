"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import { navFor, portalRoleFor, homeFor, type IconKey, type BadgeKey, type NavItem } from "@/lib/portal/roles";
import { clearDraft } from "@/lib/portal/fee-draft";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useReduced } from "./useReduced";
import { Avatar } from "./Avatar";
import { areaForPath, canUse, isStudentDesk } from "@/lib/portal/permissions";

/**
 * PORTAL CHROME (v3)
 * ---------------------------------------------------------------------------
 * One shell, four navigations. Which one a person sees comes from the ROLE ON
 * THEIR SIGNED SESSION, resolved on the server and passed in — there is no
 * control here for changing it and no client state that could be edited to
 * change it.
 *
 * The chrome is presentation. Hiding a link has never protected anything: every
 * route it points at re-checks the session on the server before rendering.
 *
 * v3 layout: a fixed sidebar (brand, quick search, the navigation, the signed-in
 * person) and a slim top bar that says where you are as "Section › Page".
 * Ctrl/⌘ + K opens a quick switcher over the same items the sidebar shows, so it
 * can never offer a page the sidebar would hide.
 */

const ICONS: Record<IconKey, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z",
  journey: "M4 20L20 4M4 20h5M20 4v5",
  applications: "M6 3h9l4 4v14H6zM15 3v4h4",
  universities: "M12 3l9 5-9 5-9-5zM5 11v5c0 1.5 3 3 7 3s7-1.5 7-3v-5",
  documents: "M6 3h9l4 4v14H6zM9 12h7M9 16h5",
  scholarships: "M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z",
  messages: "M4 5h16v11H9l-5 4z",
  consultations: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  profile: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4",
  jobs: "M3 8h18v12H3zM8 8V5h8v3",
  interviews: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6M18 3l3 3-3 3",
  requests: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  services: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  users: "M9 12a4 4 0 100-8 4 4 0 000 8zM2 21c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5M17 11a3 3 0 100-6M18 20c0-2.5 1.5-4 4-4",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  tasks: "M4 7l2 2 4-4M4 17l2 2 4-4M13 8h7M13 17h7",
};

function Icon({ name, className }: { name: IconKey; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("h-[18px] w-[18px] shrink-0", className)}>
      <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className={cn("h-4 w-4 shrink-0", className)}>
      <path d="M9 15A6 6 0 109 3a6 6 0 000 12zM17 17l-3.6-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export type Badges = Partial<Record<BadgeKey, number>>;

export function PortalShell({
  children,
  name,
  userId,
  avatarV = null,
  permissions = null,
  role,
  badges = {},
  lockedPaths = [],
  lockNote,
  status = null,
}: {
  children: React.ReactNode;
  name: string;
  userId: string;
  /** The viewer's photo version, or null for initials. */
  avatarV?: number | null;
  /** Employee access: only these areas show in the sidebar (null = all). */
  permissions?: string[] | null;
  role: Role;
  /** Live counts, computed on the server. Absent or zero renders nothing. */
  badges?: Badges;
  /**
   * Routes this visitor cannot reach yet. Computed on the SERVER and passed
   * down; greying a link out here is decoration only — every gated page guards
   * itself.
   */
  lockedPaths?: string[];
  /** One line saying why, shown on hover and to screen readers. */
  lockNote?: string | null;
  /** Where this person stands, for the header (computed by the layout). */
  status?: { label: string; tone: "ok" | "wait" | "action" } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const reduce = useReduced();

  const portalRole = portalRoleFor(role);
  const groups = navFor[portalRole]
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (!i.roles || i.roles.includes(role)) &&
          canUse(role, permissions, areaForPath(i.href)) &&
          // The student desk has no firm overview; Students is its home.
          !(i.href === "/portal/admin" && isStudentDesk(role, permissions))
      ),
    }))
    .filter((g) => g.items.length > 0);
  const home = homeFor(role);

  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => setAccountOpen(false), [pathname]);

  /*
    A thin bar across the top while the next page loads (portal-v4.css).
    Started by a click on a link to another portal page, ended when the path
    changes; a timer clears it in case the navigation never completes.
  */
  const [navigating, setNavigating] = useState(false);
  useEffect(() => setNavigating(false), [pathname]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setNavigating(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  useEffect(() => {
    if (!navigating) return;
    const t = setTimeout(() => setNavigating(false), 10000);
    return () => clearTimeout(t);
  }, [navigating]);

  // The account menu closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAccountOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  // Where you are, read off the same nav that produced the link.
  const best =
    groups
      .flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })))
      .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
  const here = best?.label ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function logout() {
    setSigningOut(true);
    analytics.portalLogout();
    // Any half-filled declaration belongs to the session that started it.
    clearDraft();
    await fetch("/api/auth/logout", { method: "POST" });
    // A full load, replacing the history entry, so Back cannot return to a
    // dashboard whose session is gone.
    window.location.replace("/login");
  }

  /*
    FOLDING SECTIONS. The section you are in is open; the others remember what
    you chose in this browser (read after the first render so the server and
    the browser draw the same thing). The first time, every section is open:
    in v3 the sections are compact enough to show in full.
  */
  // "System" starts folded: rarely used, and it keeps the menu to one screen.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.group).filter((name) => name !== "System"))
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem("portal-nav-open-v4");
      if (raw === null) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) setOpenGroups(new Set(saved.map(String)));
    } catch {}
  }, []);
  const [shut, setShut] = useState<Set<string>>(() => new Set());
  useEffect(() => setShut(new Set()), [pathname]);
  const toggleGroup = (name: string, open: boolean) => {
    setShut((cur) => {
      const next = new Set(cur);
      if (open) next.add(name);
      else next.delete(name);
      return next;
    });
    setOpenGroups((cur) => {
      const next = new Set(cur);
      if (open) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem("portal-nav-open-v4", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Only the closest match is lit: Finance > Reports, not Finance > Dashboard as well.
  const isActive = (href: string) =>
    href === home ? pathname === home : (pathname === href || pathname.startsWith(`${href}/`)) && best?.href === href;

  /* ------------------------------------------------------------ quick search */
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => setPaletteOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const searchable = useMemo(
    () =>
      groups.flatMap((g) =>
        g.items.filter((i) => !lockedPaths.includes(i.href)).map((i) => ({ ...i, group: g.group }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portalRole, role, permissions, lockedPaths.join("|")]
  );

  const Nav = (
    <nav aria-label="Portal" className="flex flex-col gap-1">
      {groups.map((g) => {
        const inHere = g.items.some((i) => isActive(i.href));
        const open = openGroups.has(g.group) || (inHere && !shut.has(g.group));
        const waiting = g.items.reduce((n, i) => n + (i.badgeKey ? badges[i.badgeKey] ?? 0 : 0), 0);
        return (
          <div key={g.group} className="pb-1">
            <button
              type="button"
              onClick={() => toggleGroup(g.group, open)}
              aria-expanded={open}
              className="group/h flex w-full items-center gap-2 rounded-lg px-2.5 pb-1.5 pt-3 text-left"
            >
              <span className="pv3-group flex-1">{g.group}</span>
              {!open && waiting > 0 && <span className="pv3-count">{waiting}</span>}
              <svg
                viewBox="0 0 12 12"
                aria-hidden
                className={cn("h-3 w-3 shrink-0 text-faint opacity-0 transition group-hover/h:opacity-100", open ? "rotate-90" : "")}
              >
                <path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/*
              THE STUDENT PIPELINE, drawn as a stepper: one rail through six
              numbered stops, so the order is seen rather than read. A stop
              with work waiting glows and carries its count.
            */}
            {open && g.style === "pipeline" && (
              <ol className="pv4-pipe">
                {g.items.map((item: NavItem) => {
                  const on = isActive(item.href);
                  const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={cn("pv4-pipe-step", on && "is-on", count > 0 && "has-work")}
                      >
                        {on && (
                          <motion.span
                            layoutId="pv3-nav-active"
                            aria-hidden
                            className="pv4-pipe-bg absolute inset-0 -z-10 rounded-lg"
                            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 40 }}
                          />
                        )}
                        <span aria-hidden className="pv4-pipe-node">{item.step}</span>
                        <span className="flex-1 truncate">
                          <span className="sr-only">Step {item.step}: </span>
                          {item.label}
                        </span>
                        {count > 0 && <span className="pv4-pipe-count">{count > 99 ? "99+" : count}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
            {open && g.style !== "pipeline" && (
              <ul className="flex flex-col gap-0.5">
                {g.items.map((item: NavItem) => {
                  const on = isActive(item.href);
                  const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                  const locked = lockedPaths.includes(item.href);

                  // A locked item is a span, not a disabled link: it cannot be
                  // focused, followed or opened in a new tab.
                  if (locked) {
                    return (
                      <li key={item.href + item.label}>
                        <span
                          aria-disabled="true"
                          title={lockNote ?? undefined}
                          className="flex h-9 cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem] text-faint"
                        >
                          <Icon name={item.icon} className="opacity-60" />
                          <span className="flex-1 truncate">{item.label}</span>
                          <svg viewBox="0 0 14 14" aria-hidden className="h-3.5 w-3.5 shrink-0">
                            <rect x="2.5" y="6" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M4.6 6V4.4a2.4 2.4 0 0 1 4.8 0V6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                          </svg>
                          <span className="sr-only">Locked. {lockNote ?? ""}</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href + item.label}>
                      <Link
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={cn("pv3-item group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem]", on && "is-on")}
                      >
                        {on && (
                          <motion.span
                            layoutId="pv3-nav-active"
                            aria-hidden
                            className="pv3-item-bg absolute inset-0 -z-10 rounded-lg"
                            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 40 }}
                          />
                        )}
                        {item.step ? (
                          <span aria-hidden className="pv3-step">
                            {item.step}
                          </span>
                        ) : (
                          <Icon name={item.icon} className="pv3-item-icon" />
                        )}
                        <span className="flex-1 truncate">
                          {item.step ? <span className="sr-only">Step {item.step}: </span> : null}
                          {item.label}
                        </span>
                        {count > 0 && <span className="pv3-count">{count > 99 ? "99+" : count}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );

  const Brand = (
    <Link href={home} className="flex items-center gap-2.5">
      <Image src="/brand/admitsfair-cap.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[10px]" />
      <span className="flex flex-col leading-tight">
        <span className="text-[0.98rem] font-semibold tracking-[-0.01em] text-fg-strong">AdmitsFair</span>
        <span className="text-[0.72rem] text-faint">Client portal</span>
      </span>
    </Link>
  );

  return (
    <div className="portal-shell pv3 tone-soft relative isolate min-h-screen">
      {navigating && <div className="pv4-progress" aria-hidden />}
      {/* Sidebar — desktop */}
      <aside className="pv3-side fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">{Brand}</div>

        <div className="px-3 pb-2">
          <button type="button" onClick={() => setPaletteOpen(true)} className="pv3-search flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-[0.85rem]">
            <SearchIcon />
            <span className="flex-1 text-left">Search pages…</span>
            <kbd className="pv3-kbd">Ctrl K</kbd>
          </button>
        </div>

        <div className="rail flex-1 overflow-y-auto px-3 pb-4">{Nav}</div>

        <div className="pv3-user m-3 flex items-center gap-3 rounded-xl p-2.5">
          <Avatar id={userId} name={name} photo={avatarV != null} v={avatarV} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.85rem] font-semibold text-fg-strong">{name}</span>
            <span className="block truncate text-[0.74rem] text-faint">{ROLE_LABEL[role]}</span>
          </span>
          <button
            type="button"
            onClick={logout}
            disabled={signingOut}
            aria-label={signingOut ? "Signing out" : "Sign out"}
            title="Sign out"
            className="pv3-icon-btn grid h-8 w-8 place-items-center rounded-lg disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-4 w-4">
              <path d="M10 2.5H4.5A1.5 1.5 0 003 4v8a1.5 1.5 0 001.5 1.5H10M7 8h6.5m0 0l-2-2m2 2l-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="relative min-w-0 lg:pl-[264px]">
        <header className="pv3-top sticky top-0 z-40 flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="portal-mobile-nav"
            aria-label="Menu"
            className="pv3-icon-btn grid h-9 w-9 place-items-center rounded-lg lg:hidden"
          >
            <span className="flex flex-col gap-[4px]">
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
            </span>
          </button>
          <span className="lg:hidden">{Brand}</span>

          {/* Where you are: Section › Page */}
          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-2 text-[0.9rem] lg:flex">
            {best && best.group && <span className="truncate text-faint">{best.group}</span>}
            {best && best.group && (
              <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 shrink-0 text-faint">
                <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className="truncate font-semibold text-fg-strong">{here ?? name}</span>
          </nav>
          <span className="flex-1 lg:hidden" />

          {/* What the portal is waiting on, coloured by whose move it is. */}
          {status && (
            <span
              className={cn(
                "pv3-status hidden shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[0.78rem] font-medium md:inline-flex",
                `is-${status.tone}`
              )}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              {status.label}
            </span>
          )}

          <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search pages" className="pv3-icon-btn grid h-9 w-9 place-items-center rounded-lg lg:hidden">
            <SearchIcon />
          </button>

          <NotificationBell unread={badges.notifications ?? 0} />

          <ThemeToggle />

          <div ref={accountRef} className="relative">
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              className="pv3-avatar-btn flex h-9 w-9 items-center justify-center rounded-full"
            >
              <span className="sr-only">Account</span>
              <Avatar id={userId} name={name} photo={avatarV != null} v={avatarV} size="md" className="h-9 w-9" />
            </button>

            {accountOpen && (
              <div role="menu" className="pv3-menu absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl p-1.5">
                <div className="px-3 py-2.5">
                  <p className="truncate text-[0.88rem] font-semibold text-fg-strong">{name}</p>
                  <p className="mt-0.5 text-[0.74rem] text-faint">{ROLE_LABEL[role]}</p>
                </div>
                <div className="my-1 h-px bg-[var(--line)]" />
                <Link role="menuitem" href="/portal/profile" className="pv3-menu-item flex h-9 items-center rounded-lg px-3 text-[0.86rem]">
                  Profile
                </Link>
                <Link role="menuitem" href="/portal/settings" className="pv3-menu-item flex h-9 items-center rounded-lg px-3 text-[0.86rem]">
                  Settings
                </Link>
                <div className="my-1 h-px bg-[var(--line)]" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={logout}
                  disabled={signingOut}
                  className="pv3-menu-item flex h-9 w-full items-center rounded-lg px-3 text-left text-[0.86rem] disabled:opacity-50"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Mobile drawer — a disclosure under the header, never an overlay. */}
        {menuOpen && (
          <div id="portal-mobile-nav" className="pv3-side border-b border-line px-3 py-4 lg:hidden">
            {Nav}
            <button
              type="button"
              onClick={logout}
              disabled={signingOut}
              className="pv3-icon-btn mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line text-[0.86rem] disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}

        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          <motion.div
            key={pathname}
            initial={reduce ? false : { opacity: 0.001, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {paletteOpen && (
        <QuickSearch
          items={searchable}
          onClose={() => setPaletteOpen(false)}
          onGo={(href) => {
            setPaletteOpen(false);
            router.push(href);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- QuickSearch */

function QuickSearch({
  items,
  onClose,
  onGo,
}: {
  items: (NavItem & { group: string })[];
  onClose: () => void;
  onGo: (href: string) => void;
}) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = items.filter((i) => {
    const hay = `${i.label} ${i.group}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const pick = Math.min(index, Math.max(0, results.length - 1));

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search pages">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgb(4_7_15/0.55)] backdrop-blur-[2px]" />
      <div className="pv3-menu relative w-full max-w-xl overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[pick]) onGo(results[pick].href);
            }}
            placeholder="Go to a page…"
            aria-label="Search pages"
            className="pv3-palette-input h-14 flex-1 bg-transparent text-[0.98rem] text-fg outline-none placeholder:text-faint"
          />
          <kbd className="pv3-kbd">Esc</kbd>
        </div>
        <ul className="rail max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[0.88rem] text-faint">No page matches “{q}”.</li>}
          {results.map((r, i) => (
            <li key={r.href + r.label}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => onGo(r.href)}
                className={cn("pv3-menu-item flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left", i === pick && "is-on")}
              >
                <Icon name={r.icon} className="text-faint" />
                <span className="flex-1 truncate text-[0.9rem] text-fg">{r.label}</span>
                <span className="truncate text-[0.76rem] text-faint">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

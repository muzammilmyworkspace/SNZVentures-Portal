"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import { navFor, portalRoleFor, homeFor, type IconKey, type BadgeKey } from "@/lib/portal/roles";
import { clearDraft } from "@/lib/portal/fee-draft";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { areaForPath, canUse, isStudentDesk } from "@/lib/portal/permissions";

/**
 * PORTAL CHROME
 * ---------------------------------------------------------------------------
 * One shell, four navigations. Which one a person sees comes from the ROLE ON
 * THEIR SIGNED SESSION, resolved on the server and passed in — there is no
 * control here for changing it and no client state that could be edited to
 * change it. The role-preview switcher lives only under /demo, behind
 * DEMO_MODE, and cannot reach this component.
 *
 * The chrome is presentation. Hiding a link has never protected anything: every
 * route it points at re-checks the session on the server before rendering.
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

function Icon({ name }: { name: IconKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px] shrink-0">
      <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One icon per sidebar section, so a folded menu still scans at a glance. */
const GROUP_ICONS: Record<string, string> = {
  overview: ICONS.dashboard,
  "student pipeline": ICONS.journey,
  people: ICONS.users,
  manage: ICONS.tasks,
  contact: ICONS.messages,
  forms: ICONS.applications,
  finance: "M4 19V9M10 19V5M16 19v-7M3 21h18",
  billing: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  account: ICONS.settings,
  "my file": ICONS.documents,
  help: ICONS.messages,
};

function GroupIcon({ group }: { group: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[16px] w-[16px]">
      <path d={GROUP_ICONS[group.toLowerCase()] ?? ICONS.services} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
   * Routes this visitor cannot reach yet.
   *
   * Computed on the SERVER from lib/portal/stage and passed down. Greying a
   * link out here is decoration only — every gated page guards itself, so
   * typing the URL gets the same answer as clicking. This exists so the
   * student can see the shape of what is coming rather than meeting a
   * redirect with no explanation.
   */
  lockedPaths?: string[];
  /** One line saying why, shown on hover and to screen readers. */
  lockNote?: string | null;
  /**
   * Where this person stands, for the header.
   *
   * Computed by the layout from the same rows the gate reads, rather than in
   * here: the shell is a client component, and shipping the stage rules to the
   * browser would mean keeping two copies of them in step.
   */
  status?: { label: string; tone: "ok" | "wait" | "action" } | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
    A menu that only closes on its own button is a menu people leave open and
    then click through. Both exits are handled: anywhere else, or Escape.
  */
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

  /*
    The name of the page you are on, read off the same nav that produced the
    link. A header that repeats your own name back at you is a header doing
    nothing; the one thing it can always say is where you are.
  */
  const best =
    groups
      .flatMap((g) => g.items)
      .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
  const here = best?.label ?? null;
  // The section the page sits in, so the bar reads "Finance / Dashboard", not just "Dashboard".
  const hereGroup = best ? groups.find((g) => g.items.includes(best))?.group ?? null : null;

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
    /*
      A full load, replacing the history entry.

      Same reasoning as sign-in: a client-side transition here can be cancelled
      mid-flight and leave the person on a dashboard whose session is already
      gone. `location.replace` drops the dashboard from history so Back cannot
      return to it, and the fresh document request meets the guard with no
      cookie and lands on the sign-in screen.
    */
    window.location.replace("/login");
  }

  /*
    FOLDING SECTIONS. All folded to begin with, except the one you are in
    (which you can still fold); the ones you open are remembered in this browser (localStorage, read after
    the first render so the server and the browser draw the same thing).
  */
  // The first time, only the first section (Overview) is open.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() =>
    // A student's menu is short: every section starts open.
    new Set(role === "student" ? groups.map((g) => g.group) : groups[0] ? [groups[0].group] : [])
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem("portal-nav-open");
      if (raw === null) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) setOpenGroups(new Set(saved.map(String)));
    } catch {}
  }, []);
  // The section you are in, folded by hand; forgotten when you go to another page.
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
        localStorage.setItem("portal-nav-open", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // Only the closest match is lit: Finance > Reports, not Finance > Dashboard as well.
  const isActive = (href: string) =>
    href === home ? pathname === home : (pathname === href || pathname.startsWith(`${href}/`)) && best?.href === href;

  const Nav = (
    <nav aria-label="Portal" className="flex flex-col">
      {groups.map((g, gi) => {
        // The section you are in opens by itself; every section folds and opens on a click.
        const here = g.items.some((i) => isActive(i.href));
        const open = openGroups.has(g.group) || (here && !shut.has(g.group));
        const waiting = g.items.reduce((n, i) => n + (i.badgeKey ? badges[i.badgeKey] ?? 0 : 0), 0);
        return (
        <div key={g.group} className={cn(gi > 0 && "mt-0.5")}>
          {/*
            A SECTION HEADING, not a menu item: no box, small capitals, bold,
            the chevron on the right. Only a page (an item) ever gets the green
            box, so the two can never be mistaken for each other.
          */}
          <button
            type="button"
            onClick={() => toggleGroup(g.group, open)}
            aria-expanded={open}
            className={cn("snzc-head group/h flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2 text-left", here && "is-here", open && "is-open")}
          >
            <span className="snzc-gicon">
              <GroupIcon group={g.group} />
            </span>
            <span
              className={cn(
                "flex-1 text-[0.86rem] font-semibold transition-colors",
                here ? "text-fg-strong" : "text-muted group-hover/h:text-fg"
              )}
            >
              {g.group}
            </span>
            {!open && waiting > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[0.68rem] font-bold text-[#070B1A]">
                {waiting}
              </span>
            )}
            <svg
              viewBox="0 0 12 12"
              aria-hidden
              className={cn("h-3 w-3 shrink-0 text-faint transition-transform group-hover/h:text-fg", open ? "rotate-90" : "")}
            >
              <path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {open && (
          <ul className="snzc-list mb-2 mt-1 flex flex-col gap-0.5">
            {g.items.map((item) => {
              const on = isActive(item.href);
              const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
              const locked = lockedPaths.includes(item.href);

              /*
                A LOCKED ITEM IS A SPAN, NOT A DISABLED LINK.

                Rendering it as an <a> and cancelling the click leaves it
                keyboard-focusable, announced as a link, and openable in a new
                tab from the context menu — three ways to reach a page it
                claims to block. A span with aria-disabled says the true thing
                to everyone and cannot be followed by anyone.
              */
              if (locked) {
                return (
                  <li key={item.href + item.label}>
                    <span
                      aria-disabled="true"
                      title={lockNote ?? undefined}
                      className="flex min-h-10 cursor-not-allowed items-center gap-3 rounded-[10px] px-3 text-[0.88rem] text-faint"
                    >
                      <Icon name={item.icon} />
                      <span className="flex-1">{item.label}</span>
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
                    className={cn(
                      "snzc-item group relative flex min-h-10 items-center gap-3 px-3 text-[0.88rem] transition-colors",
                      on && "is-on"
                    )}
                  >
                    
                    {item.step ? (
                      <span
                        aria-hidden
                        className={cn(
                          "num inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[0.66rem] font-semibold",
                          on
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[#070B1A]"
                            : "border-[var(--line-strong)] text-muted group-hover:border-[var(--accent)] group-hover:text-accent"
                        )}
                      >
                        {String(item.step).padStart(2, "0")}
                      </span>
                    ) : (
                      <span className={on ? "text-accent" : undefined}>
                        <Icon name={item.icon} />
                      </span>
                    )}
                    <span className="flex-1">
                      {item.step ? <span className="sr-only">Step {item.step}: </span> : null}
                      {item.label}
                    </span>
                    {count > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-moss-400 px-1.5 text-[0.7rem] font-semibold text-navy-950">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
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

  return (
    <div className="portal-shell snzc tone-soft relative isolate min-h-screen">
      <div className="relative z-10 mx-auto flex w-full max-w-[100rem]">
        {/* Sidebar — desktop */}
        <aside className="portal-side sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-r border-line px-3.5 pb-4 pt-5 lg:flex">
          <Link href={home} className="snzc-brand mb-5 flex items-center gap-3 rounded-[14px] px-2.5 py-2.5">
            <Image src="/brand/snz-mark.png" alt="" width={38} height={38} className="h-[38px] w-[38px] rounded-full bg-white ring-2 ring-[#6CBF3B]/40" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-[1.05rem] font-bold tracking-[-0.02em] text-fg-strong">SnZ Ventures</span>
              <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 text-[0.72rem] font-semibold text-accent">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#6CBF3B] shadow-[0_0_0_3px_rgb(108_191_59/0.25)]" />
                Client portal
              </span>
            </span>
          </Link>

          <p className="mb-1.5 px-2.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-faint">Menu</p>
          <div className="rail -mr-1.5 flex-1 overflow-y-auto pr-1.5">{Nav}</div>

          <div className="snzc-me mt-3 flex items-center gap-3 rounded-[14px] p-2.5">
            <Avatar id={userId} name={name} photo={avatarV != null} v={avatarV} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.86rem] font-semibold text-fg-strong">{name}</span>
              <span className="block truncate text-[0.74rem] text-faint">{ROLE_LABEL[role]}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              disabled={signingOut}
              aria-label={signingOut ? "Signing out" : "Sign out"}
              title="Sign out"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[rgb(255_255_255/0.08)] hover:text-fg-strong disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-4 w-4">
                <path
                  d="M10 2.5H4.5A1.5 1.5 0 003 4v8a1.5 1.5 0 001.5 1.5H10M7 8h6.5m0 0l-2-2m2 2l-2 2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <header className="snzc-top sticky top-0 z-40 flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="portal-mobile-nav"
              aria-label="Menu"
              className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-line text-muted transition-colors hover:text-fg lg:hidden"
            >
              <span className="flex flex-col gap-[4px]">
                <span className="block h-px w-4 bg-current" />
                <span className="block h-px w-4 bg-current" />
                <span className="block h-px w-4 bg-current" />
              </span>
            </button>

            {/* "Back to site" removed — see the note in AuthShell. */}

            {/* Where you are. */}
            <p className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-[1.05rem] font-semibold tracking-[-0.015em] text-fg-strong">
              {hereGroup && hereGroup !== here && (
                <span className="font-medium text-muted">{hereGroup} <span aria-hidden className="text-faint">/</span> </span>
              )}
              {here ?? name}
            </p>

            {/*
              WHAT THE PORTAL IS WAITING ON.

              This bar carried a name the person already knows, across the full
              width of every page. The one thing worth that space is the answer
              to "what happens next, and whose move is it" — so it says that,
              and it says it in a colour that distinguishes their move from
              ours. It is hidden on small screens, where the dashboard says the
              same thing with room to explain it.
            */}
            {status && (
              <span
                className={cn(
                  "hidden shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[0.78rem] font-medium md:inline-flex",
                  status.tone === "action" && "border-moss-400/50 bg-moss-400/10 text-accent",
                  status.tone === "wait" && "border-amber-300/40 bg-amber-300/10 text-warn",
                  status.tone === "ok" && "border-line text-muted"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status.tone === "action" && "bg-moss-400",
                    status.tone === "wait" && "bg-amber-300",
                    status.tone === "ok" && "bg-muted"
                  )}
                />
                {status.label}
              </span>
            )}

            <NotificationBell unread={badges.notifications ?? 0} />

            <ThemeToggle />

            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex h-9 w-9 items-center justify-center rounded-full transition-shadow hover:shadow-[0_0_0_2px_var(--accent)]"
              >
                <span className="sr-only">Account</span>
                <Avatar id={userId} name={name} photo={avatarV != null} v={avatarV} size="md" className="h-9 w-9" />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-lg"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-[0.88rem] font-semibold text-fg">{name}</p>
                    <p className="label mt-0.5 text-[0.72rem] text-faint">{ROLE_LABEL[role]}</p>
                  </div>
                  <Link
                    role="menuitem"
                    href="/portal/profile"
                    className="flex min-h-11 items-center px-4 text-[0.85rem] text-muted transition-colors hover:bg-raised hover:text-fg"
                  >
                    Profile
                  </Link>
                  <Link
                    role="menuitem"
                    href="/portal/settings"
                    className="flex min-h-11 items-center px-4 text-[0.85rem] text-muted transition-colors hover:bg-raised hover:text-fg"
                  >
                    Settings
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={logout}
                    disabled={signingOut}
                    className="flex min-h-11 w-full items-center border-t border-line px-4 text-left text-[0.85rem] text-muted transition-colors hover:bg-raised hover:text-fg disabled:opacity-50"
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Mobile drawer — a disclosure under the header rather than a shrunk
              sidebar, so it never overlays the content it navigates to. */}
          {menuOpen && (
            <div id="portal-mobile-nav" className="border-b border-line px-4 py-5 lg:hidden">
              {Nav}
              <button
                type="button"
                onClick={logout}
                disabled={signingOut}
                className="mt-5 flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-sm)] border border-line px-3 text-[0.85rem] text-muted transition-colors hover:text-fg disabled:opacity-50"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}

          <main id="main" className="px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

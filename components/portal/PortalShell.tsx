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
import { motion } from "motion/react";
import { PortalBackdrop } from "./PortalBackdrop";
import { useReduced } from "./useReduced";
import { Avatar } from "./Avatar";
import { areaForPath, canUse } from "@/lib/portal/permissions";

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
        (i) => (!i.roles || i.roles.includes(role)) && canUse(role, permissions, areaForPath(i.href))
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
  const here =
    groups
      .flatMap((g) => g.items)
      .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? null;

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

  const reduce = useReduced();

  const isActive = (href: string) =>
    href === home ? pathname === home : pathname === href || pathname.startsWith(`${href}/`);

  const Nav = (
    <nav aria-label="Portal" className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="label px-3 pb-2 text-[0.72rem] text-faint">{g.group}</p>
          <ul className="flex flex-col gap-0.5">
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
                      className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-[10px] px-3 text-[0.9rem] text-faint"
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
                      "group relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[0.9rem] transition-colors",
                      on
                        ? "font-semibold text-fg-strong"
                        : "text-muted hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] hover:text-fg"
                    )}
                  >
                    {/* The active marker slides between items (shared layout). */}
                    {on && (
                      <motion.span
                        layoutId="portal-nav-active"
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_13%,transparent)]"
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                      >
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent)]" />
                      </motion.span>
                    )}
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
        </div>
      ))}
    </nav>
  );

  return (
    <div className="portal-shell tone-soft relative isolate min-h-screen">
      <PortalBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-[100rem]">
        {/* Sidebar — desktop */}
        <aside className="portal-side sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line px-4 py-6 backdrop-blur-xl lg:flex">
          <Link href={home} className="mb-8 flex items-center gap-2.5 px-2">
            <Image src="/brand/snz-mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
            <span className="flex flex-col leading-none">
              <span className="font-[family-name:var(--font-display)] text-[1.05rem] font-semibold tracking-[-0.02em] text-fg">SnZ Ventures</span>
              <span className="label mt-1 text-[0.72rem] text-faint">Client portal</span>
            </span>
          </Link>

          <div className="rail flex-1 overflow-y-auto">{Nav}</div>

          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <Avatar id={userId} name={name} photo={avatarV != null} v={avatarV} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.85rem] font-semibold text-fg">{name}</span>
                <span className="label block text-[0.72rem] text-faint">{ROLE_LABEL[role]}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={signingOut}
              className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 text-[0.85rem] text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] hover:text-fg disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-[15px] w-[15px]">
                <path
                  d="M10 2.5H4.5A1.5 1.5 0 003 4v8a1.5 1.5 0 001.5 1.5H10M7 8h6.5m0 0l-2-2m2 2l-2 2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
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
            {/* Each page rises in on navigation. Keyed by path; skipped under
                reduced motion. Opacity starts at 0.001 rather than 0 so the
                content is never invisible to tools that test for opacity 0. */}
            <motion.div
              key={pathname}
              initial={reduce ? false : { opacity: 0.001, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </div>
  );
}

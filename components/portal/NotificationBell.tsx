"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NotificationIcon, ago } from "./NotificationKind";

type Item = { id: string; title: string; body: string | null; read: boolean; createdAt: string; kind: string };

/**
 * THE BELL in the header: the unread count, and the latest notifications a
 * click away. Each one opens through /api/portal/notifications/<id>, which
 * marks it read and goes to the thing it is about.
 *
 * The count comes from the server with the page (the sidebar badge query);
 * the list is fetched when the bell is opened, so a closed bell costs nothing.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [count, setCount] = useState(unread);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => setCount(unread), [unread]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/portal/notifications")
      .then((r) => r.json())
      .then((d: { items?: Item[]; unread?: number }) => {
        if (!alive) return;
        setItems((d.items ?? []).slice(0, 8));
        if (typeof d.unread === "number") setCount(d.unread);
      })
      .catch(() => alive && setItems([]));
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    await fetch("/api/portal/notifications", { method: "PATCH" }).catch(() => {});
    setCount(0);
    setItems((cur) => cur?.map((n) => ({ ...n, read: true })) ?? cur);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        className="relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-line text-muted transition-colors hover:border-[var(--accent)] hover:text-fg"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-[18px] w-[18px]">
          <path d="M8 2a4 4 0 0 0-4 4v2.8L2.6 11h10.8L12 8.8V6a4 4 0 0 0-4-4zM6.5 13a1.5 1.5 0 0 0 3 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[0.68rem] font-bold text-[#070B1A] ring-2 ring-[var(--panel-solid,#1B2645)]">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[16px] border border-line bg-[var(--panel-solid,#1B2645)] shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-[0.95rem] font-semibold text-fg-strong">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={markAll} className="text-[0.78rem] text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-[0.85rem] text-faint">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[0.85rem] text-faint">You are all caught up.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {items.map((n) => (
                  <li key={n.id}>
                    <a
                      href={`/api/portal/notifications/${n.id}`}
                      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] ${
                        n.read ? "" : "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                      }`}
                    >
                      <NotificationIcon kind={n.kind} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[0.86rem] leading-snug ${n.read ? "text-muted" : "font-semibold text-fg"}`}>{n.title}</span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-[0.78rem] leading-snug text-faint">{n.body}</span>}
                        <span className="mt-1 block text-[0.7rem] text-faint">{ago(n.createdAt)}</span>
                      </span>
                      {!n.read && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/portal/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-3 text-center text-[0.85rem] font-semibold text-accent hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

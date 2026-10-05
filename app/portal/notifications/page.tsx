import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { MarkAllRead } from "@/components/portal/MarkAllRead";
import { getNotifications } from "@/lib/db/repos/portal";
import { NotificationIcon, kindLabel } from "@/components/portal/NotificationKind";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

function when(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default async function NotificationsPage() {
  const { session } = await requireUser("/portal/notifications");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Activity" title="Notifications" />
        <NotConfigured />
      </>
    );
  }

  const items = await getNotifications(session.userId, 50);
  const unread = items.filter((n) => !n.read).length;

  return (
    <>
      <PortalHeading
        eyebrow="Activity"
        title="Notifications"
        lead="Everything that has happened for you. Click one to go straight to it."
        action={unread > 0 ? <MarkAllRead /> : undefined}
      />

      <Panel padded={items.length === 0}>
        {items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nothing yet"
            body="When a document is reviewed, a status changes or an advisor replies, it appears here."
          />
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {items.map((n) => (
              <li key={n.id}>
                {/* Through the open route: marks it read, then goes to the thing. */}
                <a
                  href={`/api/portal/notifications/${n.id}`}
                  className={`group relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] ${
                    n.read ? "" : "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                  }`}
                >
                  {!n.read && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[var(--accent)]" />}
                  <NotificationIcon kind={n.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={n.read ? "text-[0.95rem] text-muted" : "text-[0.95rem] font-semibold text-fg-strong"}>
                        {n.title}
                        {!n.read && <span className="sr-only"> (unread)</span>}
                      </span>
                      <span className="label text-[0.62rem] text-faint">{kindLabel(n.kind)}</span>
                    </span>
                    {n.body && <span className="mt-0.5 block text-[0.86rem] leading-relaxed text-muted">{n.body}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <time dateTime={n.createdAt} className="whitespace-nowrap text-[0.75rem] text-faint">
                      {when(n.createdAt)}
                    </time>
                    <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3 w-3 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent">
                      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

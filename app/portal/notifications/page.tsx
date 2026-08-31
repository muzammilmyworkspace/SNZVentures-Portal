import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { MarkAllRead } from "@/components/portal/MarkAllRead";
import { getNotifications } from "@/lib/db/repos/portal";

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
        lead="Document decisions, status changes and replies from your advisor."
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
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const inner = (
                <>
                  <span className="flex items-start gap-3">
                    {/* Unread marker doubles as the only colour on the row, so
                        the eye lands on what is new without a legend. */}
                    <span
                      aria-hidden
                      className={
                        n.read
                          ? "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-transparent"
                          : "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss-400"
                      }
                    />
                    <span className="min-w-0">
                      <span
                        className={
                          n.read
                            ? "block text-[0.95rem] text-muted"
                            : "block text-[0.95rem] font-medium text-fg"
                        }
                      >
                        {n.title}
                        {!n.read && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-muted">
                          {n.body}
                        </span>
                      )}
                    </span>
                  </span>
                  <time
                    dateTime={n.createdAt}
                    className="shrink-0 whitespace-nowrap text-[0.75rem] text-faint"
                  >
                    {when(n.createdAt)}
                  </time>
                </>
              );

              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="flex min-h-16 items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex min-h-16 items-start justify-between gap-4 px-5 py-4">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

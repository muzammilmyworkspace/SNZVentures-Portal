import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth/guard";
import { Panel } from "@/components/portal/Pieces";
import { Avatar } from "@/components/portal/Avatar";
import { groupOf } from "@/lib/portal/member-id";
import { ChatPanel } from "@/components/portal/ChatPanel";
import * as repo from "@/lib/db/repos/portal";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

/**
 * One thread.
 *
 * The id comes out of the URL and is therefore untrusted. `canAccessConversation`
 * resolves the relationship in SQL — owner, assigned advisor, or admin — and
 * anything else is a 404 rather than a 403, so probing the URL cannot even
 * confirm that a given conversation exists.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session } = await requireUser(`/portal/messages/${id}`);

  if (!(await repo.canAccessConversation(id, session.userId, session.role))) {
    notFound();
  }

  const messages = await repo.getMessages(id);
  await repo.markConversationRead(id, session.userId);
  const head = await repo.conversationHeader(id);
  const staff = isStaff(session.role);
  // Staff reading their own thread with the firm, or a client: it is "SnZ Ventures".
  const withFirm = !head || head.ownerId === session.userId;
  const group = head ? groupOf(head.role) : "student";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Link href="/portal/messages" className="label inline-flex items-center gap-2 text-[0.72rem] text-faint hover:text-accent">
          <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-2.5 w-2.5">
            <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All messages
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-line bg-[image:var(--panel-bg)] p-4 shadow-[var(--panel-shadow)]">
        <span className="flex min-w-0 items-center gap-4">
          {withFirm ? (
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[0.85rem] font-bold text-[#070B1A]">
              SnZ
            </span>
          ) : (
            <Avatar id={head!.ownerId} name={head!.name} photo={head!.avatarV != null} v={head!.avatarV} size="lg" />
          )}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[1.3rem] font-semibold text-fg-strong">{withFirm ? "SnZ Ventures" : head!.name}</h1>
              {!withFirm && (
                <span data-group={group} className="group-tag">
                  {group === "consultant" ? "Consultant" : group === "employee" ? "Employee" : "Student"}
                </span>
              )}
            </span>
            <span className="block truncate text-[0.85rem] text-muted">
              {head?.subject ?? "Conversation"}
              {!withFirm && head ? ` · ${head.email}` : ""}
            </span>
          </span>
        </span>
        {staff && !withFirm && head && (
          <Link
            href={`/portal/admin/users/${head.ownerId}`}
            className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[0.88rem] text-fg transition-colors hover:border-[var(--accent)] hover:text-accent"
          >
            Open their file
          </Link>
        )}
      </div>
      <Panel>
        <ChatPanel
          conversationId={id}
          viewerId={session.userId}
          initialMessages={messages}
          emptyPrompt="Nothing in this thread yet."
        />
      </Panel>
    </>
  );
}

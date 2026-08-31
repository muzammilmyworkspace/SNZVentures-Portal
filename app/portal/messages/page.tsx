import type { Metadata } from "next";
import { requireUser, isStaff, isAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";

import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { ChatPanel } from "@/components/portal/ChatPanel";
import * as repo from "@/lib/db/repos/portal";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

/**
 * MESSAGES
 *
 * A client has ONE thread with the desk. Multiple subjects would make them
 * choose where a question belongs before they have asked it, and an advisory
 * relationship is a conversation rather than a ticket queue — so the client
 * view opens the thread directly instead of showing a list of one.
 *
 * Staff see the list, because they hold many.
 */
export default async function MessagesPage() {
  const { session } = await requireUser("/portal/messages");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Contact" title="Messages" lead="Talk to the people handling your case." />
        <NotConfigured />
      </>
    );
  }

  const staff = isStaff(session.role);

  if (staff) {
    const conversations = await repo.getConversationsForStaff(session.userId, isAdmin(session.role));
    return (
      <>
        <PortalHeading
          eyebrow="Desk"
          title="Messages"
          lead="Client conversations, most recently active first."
        />
        <Panel padded={false}>
          {conversations.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="message"
                title="No conversations yet"
                body="When a client writes to the desk, the thread appears here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {conversations.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/portal/messages/${c.id}`}
                    className="flex min-h-16 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.95rem] font-medium text-fg">
                        {c.clientName ?? c.subject}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.8rem] text-faint">
                        {c.subject}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {c.unread > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-moss-400 px-1.5 text-[0.7rem] font-semibold text-navy-950">
                          {c.unread}
                        </span>
                      )}
                      <time
                        dateTime={c.updatedAt}
                        className="text-[0.75rem] text-faint"
                      >
                        {new Date(c.updatedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                      </time>
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

  // Client — open the single thread, creating nothing until they actually write.
  const conversations = await repo.getConversationsForClient(session.userId);
  const thread = conversations[0] ?? null;
  const messages = thread ? await repo.getMessages(thread.id) : [];
  if (thread) await repo.markConversationRead(thread.id, session.userId);

  return (
    <>
      <PortalHeading
        eyebrow="Contact"
        title="Messages"
        lead="Talk to the people handling your case, with the whole thread in one place."
      />
      <Panel>
        <ChatPanel
          conversationId={thread?.id ?? null}
          viewerId={session.userId}
          initialMessages={messages}
          emptyPrompt="No messages yet. Ask us anything about your case — an advisor picks these up during Vilnius working hours."
        />
      </Panel>
    </>
  );
}

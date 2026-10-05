import type { Metadata } from "next";
import { requireUser, isStaff, isAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";

import { NotConfigured } from "@/components/portal/NotConfigured";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { ChatPanel } from "@/components/portal/ChatPanel";
import * as repo from "@/lib/db/repos/portal";
import { NewMessageButton, MessageFirmButton } from "@/components/portal/NewMessage";
import { Avatar } from "@/components/portal/Avatar";
import { groupOf } from "@/lib/portal/member-id";

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
    const waiting = conversations.filter((c) => c.unread > 0).length;
    return (
      <>
        <PortalHeading
          eyebrow="Contact"
          title="Messages"
          lead={
            waiting
              ? `${waiting} ${waiting === 1 ? "conversation is" : "conversations are"} waiting for a reply. Most recently active first.`
              : "Conversations with students, consultants and the team, most recently active first."
          }
          action={
            isAdmin(session.role) ? (
              <NewMessageButton />
            ) : session.role === "advisor" ? (
              <MessageFirmButton name={session.name} />
            ) : undefined
          }
        />
        <Panel padded={false}>
          {conversations.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="message"
                title="No conversations yet"
                body="When someone writes, or you start a conversation, it appears here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {conversations.map((c) => {
                const own = c.clientId === session.userId;
                const name = own ? "SnZ Ventures" : c.clientName ?? c.subject;
                const fresh = c.unread > 0;
                return (
                  <li key={c.id}>
                    <a
                      href={`/portal/messages/${c.id}`}
                      className={`group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] ${
                        fresh ? "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]" : ""
                      }`}
                    >
                      {fresh && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[var(--accent)]" />}
                      {own ? (
                        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[0.75rem] font-bold text-[#070B1A]">
                          SnZ
                        </span>
                      ) : (
                        <Avatar id={c.clientId ?? c.id} name={name} photo={c.clientAvatarV != null} v={c.clientAvatarV} size="md" className="h-11 w-11" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`truncate text-[0.98rem] ${fresh ? "font-semibold text-fg-strong" : "font-medium text-fg"}`}>{name}</span>
                          {!own && c.clientRole && (
                            <span data-group={groupOf(c.clientRole)} className="group-tag">
                              {groupOf(c.clientRole) === "consultant" ? "Consultant" : groupOf(c.clientRole) === "employee" ? "Employee" : "Student"}
                            </span>
                          )}
                          <span className="truncate text-[0.78rem] text-faint">· {c.subject}</span>
                        </span>
                        <span className={`mt-1 block truncate text-[0.86rem] ${fresh ? "text-fg" : "text-muted"}`}>
                          {c.lastBody ? `${c.lastFromClient ? "" : "You: "}${c.lastBody}` : "No messages yet"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <time dateTime={c.updatedAt} className="text-[0.75rem] text-faint">
                          {new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </time>
                        {fresh ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[0.7rem] font-bold text-[#070B1A]">
                            {c.unread}
                          </span>
                        ) : c.lastFromClient ? (
                          <span className="text-[0.7rem] font-semibold text-warn">Waiting on you</span>
                        ) : null}
                      </span>
                    </a>
                  </li>
                );
              })}
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

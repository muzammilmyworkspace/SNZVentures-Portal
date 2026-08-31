import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth/guard";
import { PortalHeading, Panel } from "@/components/portal/Pieces";
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

  return (
    <>
      <PortalHeading
        eyebrow="Conversation"
        title="Conversation"
        action={
          <Link
            href="/portal/messages"
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
          >
            All messages
          </Link>
        }
        lead={
          isStaff(session.role)
            ? "Replies here are visible to the client immediately."
            : "Your thread with the SnZ desk."
        }
      />
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

"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, startTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * CHAT PANEL
 * ---------------------------------------------------------------------------
 * A client talks to the SnZ desk. There is no client-to-client channel — the
 * API resolves who may read a thread from the database, so this component
 * cannot open one it should not see even if handed an arbitrary id.
 *
 * NEAR-REAL-TIME BY POLLING, DELIBERATELY.
 * The brief allows realtime "if practical within the existing architecture".
 * It is not: this app runs on serverless functions with no WebSocket server
 * and no pub/sub, so a socket layer would mean new infrastructure for a
 * low-traffic advisory inbox. Polling every 12 seconds while the tab is
 * visible costs one indexed query per client and stops entirely when the tab
 * is hidden — which is honest about what it is rather than pretending to push.
 */

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
};

const POLL_MS = 12_000;
const STAFF = new Set(["advisor", "admin", "super_admin"]);

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function ChatPanel({
  conversationId,
  viewerId,
  initialMessages,
  emptyPrompt,
}: {
  conversationId: string | null;
  viewerId: string;
  initialMessages: ChatMessage[];
  emptyPrompt: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState(conversationId);

  // Optimistic echo, so the message appears the instant it is sent rather than
  // after a round trip. Reconciled by the refresh that follows.
  const [shown, addOptimistic] = useOptimistic(
    messages,
    (state: ChatMessage[], next: ChatMessage) => [...state, next]
  );

  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  /**
   * Only auto-scroll when the reader is already at the bottom. Yanking someone
   * back down while they are reading an earlier message is worse than a
   * missed scroll.
   */
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (pinned.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length]);

  const refresh = useCallback(async () => {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/portal/messages?conversation=${encodeURIComponent(threadId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      // A failed poll is not worth an error banner — the next one will do.
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    let timer: number | undefined;

    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, POLL_MS);
    };

    start();
    // Catch up immediately when the tab comes back rather than waiting out
    // the remainder of an interval that ran while it was hidden.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [threadId, refresh]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setDraft("");

    startTransition(() => {
      addOptimistic({
        id: `pending-${Date.now()}`,
        authorId: viewerId,
        authorName: "You",
        authorRole: "self",
        body: text,
        createdAt: new Date().toISOString(),
      });
    });

    try {
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: threadId, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Your message wasn't sent.");
        setDraft(text); // hand it back rather than losing what they typed
        setSending(false);
        return;
      }
      if (!threadId && data.conversationId) setThreadId(data.conversationId);
      await refresh();
    } catch {
      setError("Network problem. Your message is back in the box — try again.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";

  return (
    <div className="flex h-[min(68vh,40rem)] flex-col">
      {/* Thread */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-1"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {shown.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-sm text-[0.9rem] leading-relaxed text-muted">{emptyPrompt}</p>
          </div>
        ) : (
          <ul className="space-y-3 py-2">
            {shown.map((m) => {
              const mine = m.authorId === viewerId;
              const day = dayLabel(m.createdAt);
              const newDay = day !== lastDay;
              lastDay = day;
              const pending = m.id.startsWith("pending-");

              return (
                <li key={m.id}>
                  {newDay && (
                    <p className="my-4 text-center text-[0.7rem] uppercase tracking-[0.14em] text-faint">
                      {day}
                    </p>
                  )}
                  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[min(85%,34rem)]", mine && "text-right")}>
                      {!mine && (
                        <p className="mb-1 px-1 text-[0.75rem] text-faint">
                          {m.authorName}
                          {STAFF.has(m.authorRole) && (
                            <span className="ml-1.5 text-accent">· SnZ Ventures</span>
                          )}
                        </p>
                      )}
                      <div
                        className={cn(
                          "rounded-[var(--radius-md)] px-4 py-2.5 text-left text-[0.9rem] leading-relaxed",
                          mine
                            ? "bg-moss-400 text-navy-950"
                            : "border border-line bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] text-fg",
                          pending && "opacity-60"
                        )}
                      >
                        {/* whitespace-pre-wrap so paragraphs a client typed survive */}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                      <p className="mt-1 px-1 text-[0.7rem] text-faint">
                        {pending ? "Sending…" : time(m.createdAt)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="mt-3 border-t border-line pt-3">
        {error && (
          <p role="alert" className="mb-2 text-[0.8rem] text-red-300">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Write a message
          </label>
          <textarea
            id="chat-input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline. Standard for a chat box,
              // and the hint below says so rather than leaving it to be guessed.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message…"
            maxLength={4000}
            className="field max-h-40 min-h-11 flex-1 resize-y py-2.5"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="label inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="mt-2 text-[0.7rem] text-faint">
          Enter sends · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}

import type { Facts } from "@/components/portal/FeeFields";

/**
 * THE HALF-FILLED DECLARATION, KEPT ACROSS A REFRESH.
 * ---------------------------------------------------------------------------
 * Twenty fields, a passport number and an address, and a stray reload emptied
 * all of it. People do not carefully retype a legal declaration the second
 * time; they abandon it, or they guess. Losing the work is the bigger risk.
 *
 * WHAT IS KEPT — the typed answers, the step, and whether the declaration was
 * read. That is the expensive part.
 *
 * WHAT IS NOT, deliberately:
 *   • THE SIGNATURE. It takes two seconds to redraw, and a signature image
 *     sitting in a shared browser's storage is not worth that convenience.
 *   • THE RECEIPT FILE. Not a choice — a browser cannot hand a File back after
 *     a reload. Rather than restore someone to the final step with an
 *     attachment that has silently vanished, the step is wound back to the one
 *     that asks for it.
 *
 * IT EXPIRES. A week, then it is dropped. A stale declaration that half
 * matches somebody's situation is worse than a blank one — and this holds a
 * passport number, so it should not sit in a shared browser indefinitely. It
 * is also cleared the moment the form is submitted, and on sign-out.
 */

const KEY = "snz.fee.draft.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type FeeDraft = {
  at: number;
  facts: Partial<Facts>;
  step?: string;
  agreed?: boolean;
};

/** Everything here is best-effort: storage throws in private modes. */
export function readDraft(): FeeDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as FeeDraft;
    if (!draft?.at || Date.now() - draft.at > TTL_MS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft(draft: Omit<FeeDraft, "at">): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    /* Full, or blocked. Losing the draft is not worth breaking the form. */
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

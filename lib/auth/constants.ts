/**
 * Runtime-agnostic auth constants.
 *
 * Kept separate from session.ts so the Edge middleware can read cookie names
 * without pulling in node:crypto or next/headers, neither of which exists on
 * the Edge runtime.
 */
export const SESSION_COOKIE = "snz_session";
export const CSRF_COOKIE = "snz_csrf";
/**
 * A DAY, NOT A WEEK.
 *
 * This was seven days — long enough that closing the browser and coming back
 * two or three days later looked, correctly, like the session had never
 * ended. That surprised more than one person: the expectation for a portal
 * holding client documents and payment details is that walking away for a
 * while means signing in again, not that the tab is still live whenever it
 * is reopened.
 *
 * There is no "remember me" — every session gets this one lifetime. A shorter
 * absolute expiry is the simplest version of that: it needs no idle tracking,
 * no last-active column, nothing that can silently keep renewing itself. It
 * costs signing in once a day even with daily use, which is the trade this
 * portal should make.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

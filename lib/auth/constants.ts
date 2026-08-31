/**
 * Runtime-agnostic auth constants.
 *
 * Kept separate from session.ts so the Edge middleware can read cookie names
 * without pulling in node:crypto or next/headers, neither of which exists on
 * the Edge runtime.
 */
export const SESSION_COOKIE = "snz_session";
export const CSRF_COOKIE = "snz_csrf";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

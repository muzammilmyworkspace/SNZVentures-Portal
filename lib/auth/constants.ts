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
 * HOW LONG A SESSION SURVIVES WITH NOBODY THERE.
 *
 * This was an absolute 24 hours on a persistent cookie, and the report that
 * changed it was exact: signed in, closed the tab, opened the link the next
 * day, still signed in. Both halves of that were wrong for a portal holding
 * passports and bank statements — the cookie outlived the browser because it
 * carried a Max-Age, and the token outlived the visit because its only clock
 * was an absolute one that ran whether anybody was there or not.
 *
 * So the session now expires from INACTIVITY. A token is minted with this
 * window and the portal refreshes it while a tab is actually open and visible;
 * close the tab, and nothing refreshes it, and it lapses. The absolute cap
 * below still applies on top, so an always-open tab cannot live for ever.
 *
 * Thirty minutes is the usual figure for a workspace holding identity
 * documents. It is long enough to read a case file and fill in a form without
 * interruption, and short enough that a laptop left open in a shared office is
 * not an open session an hour later.
 */
export const SESSION_IDLE_SECONDS = 30 * 60;

/**
 * THE CEILING, WHICH NOTHING EXTENDS.
 *
 * Idle expiry alone can be renewed indefinitely — that is its purpose, and it
 * is also how a session quietly becomes permanent for anyone who leaves the
 * portal open. This is carried in the token from the moment of sign-in and
 * copied forward on every refresh, never recalculated, so no amount of
 * activity pushes it out. Twelve hours means a session cannot outlast the
 * working day it began in.
 */
export const SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60;

/**
 * Retained under its old name because it is what a token is minted with, and
 * renaming it at every call site would obscure a change that is really about
 * WHICH clock runs rather than about how tokens are made.
 */
export const SESSION_MAX_AGE_SECONDS = SESSION_IDLE_SECONDS;

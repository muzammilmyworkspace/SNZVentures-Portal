"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLE_LABEL, type Role, CLIENT_ROLES } from "@/lib/auth/types";
import { StatusPill } from "./Pieces";
import { Avatar } from "./Avatar";
import { MessageBar } from "./MessageBar";
import { memberId, groupOf } from "@/lib/portal/member-id";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  /** Who they already belong to. Null for staff, and for nobody's client. */
  advisorId: string | null;
  advisorName: string | null;
  /** Null when they have no photo; otherwise its version. */
  avatarV?: number | null;
  /** The person's number, shown as STU-0012 / CON-0003 / EMP-0001. */
  memberNo?: number | null;
  /** Consultants: the code students type at sign-up. */
  consultantCode?: string | null;
};

/**
 * Admin user table.
 *
 * The controls here are convenience only — every action re-validates on the
 * server (`/api/admin/users`), which is where privilege escalation is actually
 * prevented. Options are also narrowed client-side so an admin is not shown
 * roles they cannot grant.
 */
export function UserTable({
  users,
  advisors,
  actorRole,
  actorId,
  offset = 0,
  historyBase,
  total = 0,
  filter,
  viewLabel = "this view",
}: {
  users: Row[];
  advisors: { id: string; name: string }[];
  actorRole: Role;
  actorId: string;
  /** Rows before this page, so the serial number continues across pages. */
  offset?: number;
  /** This page's URL ending in "?" or "&", to which `history=<id>` is added. */
  historyBase?: string;
  /** Everyone matching the current filter, across all pages. */
  total?: number;
  /** The current filter, so "message everyone" reaches all pages of it. */
  filter?: { role?: string; status?: string; q?: string };
  viewLabel?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  /*
    The generated reset link, held per user so two rows cannot show each
    other's. It is shown ONCE and never stored: it is a live credential for
    thirty minutes, and putting it anywhere persistent would defeat the point
    of it being single-use.
  */
  const [resetLink, setResetLink] = useState<{ id: string; url: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grantable: Role[] =
    actorRole === "super_admin"
      ? ["student", "professional", "business", "advisor", "admin", "super_admin"]
      : ["student", "professional", "business", "advisor"];

  async function act(userId: string, payload: Record<string, unknown>) {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        link?: string;
      };
      if (!res.ok) setError(data.error ?? "That action failed.");
      else {
        if (data.link) setResetLink({ id: userId, url: data.link });
        startTransition(() => router.refresh());
      }
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!users.length) {
    return (
      <p className="p-6 text-[0.9rem] text-muted">
        No users match those filters.
      </p>
    );
  }

  return (
    <>
      <MessageBar
        picked={[...picked]}
        total={total}
        filter={filter}
        viewLabel={viewLabel}
        onSent={() => setPicked(new Set())}
      />
      {error && (
        <p role="alert" className="border-b border-line bg-red-500/10 px-5 py-3 text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      <div className="rail overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <caption className="sr-only">Portal users</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="w-10 px-5 py-3">
                <input
                  type="checkbox"
                  aria-label="Select everyone on this page"
                  checked={users.length > 0 && users.every((u) => picked.has(u.id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(users.map((u) => u.id)) : new Set())}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </th>
              {["#", "User", "ID", "Role", "Status", "Actions"].map((h) => (
                <th key={h} scope="col" className="label px-5 py-3 text-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => {
              const self = u.id === actorId;
              const locked =
                self || (u.role === "super_admin" && actorRole !== "super_admin");

              return (
                <tr
                  key={u.id}
                  className={cn(
                    "border-b border-line last:border-0",
                    busyId === u.id && "opacity-50"
                  )}
                >
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${u.name}`}
                      checked={picked.has(u.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(u.id);
                        else next.delete(u.id);
                        setPicked(next);
                      }}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="px-5 py-3 font-mono text-[0.8rem] text-faint">{offset + idx + 1}</td>
                  <td className="px-5 py-3">
                    {/*
                      The client file existed but nothing linked to it, so the
                      only way to open a user was to type the UUID into the
                      address bar. Making it reachable is also what let the QA
                      matrix start testing it.
                    */}
                    {/*
                      NO PREFETCH, and this is not a micro-optimisation.

                      Next prefetches every visible Link, so opening this list
                      fired a full client-file render for every row at once —
                      six lambdas, each running several queries, all hitting
                      Supabase's transaction pooler in the same instant.

                      That pooler does not refuse a connection it cannot serve:
                      it completes the handshake and never assigns a backend, so
                      the request HANGS rather than failing. Which is why this
                      surfaced as a 30-second gateway timeout with nothing in
                      the logs, on a page that loads fine when opened alone.

                      A client file is opened deliberately, one at a time.
                      Prefetching them buys nothing and costs the pool.
                    */}
                    <span className="flex items-center gap-3">
                      <Avatar id={u.id} name={u.name} photo={u.avatarV != null} v={u.avatarV} size="md" />
                      <span className="min-w-0">
                        <Link
                          prefetch={false}
                          href={`/portal/admin/users/${u.id}`}
                          className="block text-[0.9rem] text-fg underline-offset-4 hover:text-accent hover:underline"
                        >
                          {u.name}
                        </Link>
                        <span className="block text-[0.8rem] text-faint">{u.email}</span>
                      </span>
                    </span>
                  </td>

                  <td data-group={groupOf(u.role)} className="group-id whitespace-nowrap px-5 py-3 font-mono text-[0.8rem] font-semibold">
                    {memberId(u.role, u.memberNo ?? null)}
                    {u.role === "advisor" && u.consultantCode && (
                      <span className="mt-0.5 block font-sans text-[0.7rem] font-medium text-faint" title="The code students type when they sign up">
                        Code: <span className="font-mono text-fg">{u.consultantCode}</span>
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    {locked ? (
                      <span data-group={groupOf(u.role)} className="group-tag">{ROLE_LABEL[u.role]}</span>
                    ) : (
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={pending}
                        onChange={(e) => act(u.id, { action: "set_role", role: e.target.value })}
                        data-group={groupOf(u.role)}
                        className="chip-select"
                      >
                        {grantable.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/*
                    THE STATUS IS THE CONTROL.

                    It used to be a read-only pill, with a separate Suspend
                    button three columns away doing the thing the pill
                    described. Two places for one fact, and the button pushed
                    the row's actions onto a second line. Changing it here says
                    what it does and puts the state and the switch in the same
                    place.
                  */}
                  <td className="px-5 py-3">
                    {self || locked ? (
                      <StatusPill
                        status={u.status === "active" ? "approved" : "needs_update"}
                        label={u.status}
                      />
                    ) : (
                      <select
                        aria-label={`Status for ${u.name}`}
                        value={u.status === "active" ? "active" : "inactive"}
                        disabled={pending}
                        onChange={(e) =>
                          act(u.id, {
                            action: e.target.value === "active" ? "activate" : "suspend",
                          })
                        }
                        data-tone={u.status === "active" ? "good" : "bad"}
                        className="chip-select"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    )}
                  </td>


                  {/*
                    ONE ROW, ONE WIDTH EACH.

                    Suspend has moved into the status column, which leaves
                    three actions that fit on a single line — and giving them a
                    shared minimum width means the column reads as three
                    columns rather than as ragged text. They wrapped before,
                    which is what made every row look accidental.
                  */}
                  <td className="px-5 py-3">
                    {self ? (
                      <span className="text-[0.8rem] text-faint">This is you</span>
                    ) : locked ? (
                      <span className="text-[0.8rem] text-faint">Restricted</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {historyBase && (
                          <Link
                            href={`${historyBase}history=${u.id}`}
                            scroll={false}
                            aria-label={`${u.name}'s history`}
                            data-tip="History"
                            className="icon-btn tip"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <circle cx="8" cy="8" r="6" />
                              <path d="M8 4.5V8l2.5 1.5" />
                            </svg>
                          </Link>
                        )}
                        {/*
                          LOGIN — red, and only for client accounts.

                          Red because this is the one action here that makes
                          you somebody else. Suspend and Delete are reversible
                          or confirmed; signing in as a person is neither, and
                          the colour should say so before it is pressed rather
                          than after.

                          Staff cannot be logged into by anyone: a client
                          account grants nothing an admin lacks, so the feature
                          has a purpose in that direction and is privilege
                          escalation in the other.
                        */}
                        {(CLIENT_ROLES.includes(u.role) || (u.role === "advisor" && actorRole === "super_admin")) && u.status === "active" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={async () => {
                              const res = await fetch("/api/admin/impersonate", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: u.id }),
                              });
                              const data = (await res.json().catch(() => ({}))) as {
                                ok?: boolean;
                                error?: string;
                                redirectTo?: string;
                              };
                              if (!res.ok || !data.ok) {
                                alert(data.error ?? "That didn't work.");
                                return;
                              }
                              window.location.assign(data.redirectTo ?? "/portal");
                            }}
                            aria-label={`Log in as ${u.name}`}
                            data-tip="Log in as this user"
                            data-tone="warn"
                            className="icon-btn tip"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" />
                              <path d="M10 5l3 3-3 3M13 8H6" />
                            </svg>
                          </button>
                        ) : (
                          <span className="w-8" aria-hidden />
                        )}

                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(u.id, { action: "reset_password" })}
                          aria-label={`Make a password reset link for ${u.name}`}
                          data-tip="Password reset link"
                          className="icon-btn tip"
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <circle cx="5.5" cy="10.5" r="3" />
                            <path d="M7.7 8.3L13.5 2.5M11.5 4.5l1.5 1.5M10 6l1.2 1.2" />
                          </svg>
                        </button>

                        {actorRole === "super_admin" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              /*
                                Typed confirmation, not a yes/no box. This
                                cascades to the person's cases, documents,
                                messages and consents and cannot be undone, so
                                it should be impossible to do by reflex on the
                                wrong row.
                              */
                              const typed = window.prompt(
                                `Permanently delete ${u.name} (${u.email}) and everything attached to them?

This cannot be undone. Set them to Inactive instead if you only want to block access.

Type DELETE to confirm.`
                              );
                              if (typed === "DELETE") act(u.id, { action: "delete" });
                            }}
                            aria-label={`Delete ${u.name} permanently`}
                            data-tip="Delete user"
                            data-tone="danger"
                            className="icon-btn tip"
                          >
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.1a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.8 6.8v4.4M9.2 6.8v4.4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {resetLink?.id === u.id && (
                      <div className="mt-3 rounded-[var(--radius-sm)] border border-moss-400/45 bg-moss-400/10 p-3">
                        <p className="text-[0.78rem] font-semibold text-fg">
                          Reset link — valid 30 minutes, works once
                        </p>
                        <p className="mt-1.5 break-all font-mono text-[0.72rem] leading-relaxed text-muted">
                          {resetLink.url}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(resetLink.url)}
                            className="label rounded-[var(--radius-sm)] border border-line px-3 py-1 text-[0.7rem] text-muted hover:text-fg"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetLink(null)}
                            className="label rounded-[var(--radius-sm)] border border-line px-3 py-1 text-[0.7rem] text-muted hover:text-fg"
                          >
                            Hide
                          </button>
                        </div>
                        <p className="mt-2 text-[0.72rem] leading-relaxed text-faint">
                          Send this to them yourself. It is not emailed, and
                          making a new one cancels this one.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import { StatusPill } from "./Pieces";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  emailVerified: boolean;
  createdAt: string;
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
}: {
  users: Row[];
  advisors: { id: string; name: string }[];
  actorRole: Role;
  actorId: string;
}) {
  const router = useRouter();
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
      {error && (
        <p role="alert" className="border-b border-line bg-red-500/10 px-5 py-3 text-[0.85rem] text-red-200">
          {error}
        </p>
      )}
      <div className="rail overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <caption className="sr-only">Portal users</caption>
          <thead>
            <tr className="border-b border-line">
              {["User", "Role", "Status", "Advisor", "Actions"].map((h) => (
                <th key={h} scope="col" className="label px-5 py-3 text-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
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
                    {/*
                      The client file existed but nothing linked to it, so the
                      only way to open a user was to type the UUID into the
                      address bar. Making it reachable is also what let the QA
                      matrix start testing it.
                    */}
                    <Link
                      href={`/portal/admin/users/${u.id}`}
                      className="block text-[0.9rem] text-fg underline-offset-4 hover:text-accent hover:underline"
                    >
                      {u.name}
                    </Link>
                    <span className="block text-[0.8rem] text-faint">{u.email}</span>
                  </td>

                  <td className="px-5 py-3">
                    {locked ? (
                      <span className="label text-faint">{ROLE_LABEL[u.role]}</span>
                    ) : (
                      <select
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={pending}
                        onChange={(e) => act(u.id, { action: "set_role", role: e.target.value })}
                        className="field py-1.5 text-[0.85rem]"
                      >
                        {grantable.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <StatusPill
                      status={u.status === "active" ? "approved" : "needs_update"}
                      label={u.status}
                    />
                  </td>

                  <td className="px-5 py-3">
                    {locked || !advisors.length ? (
                      <span className="text-[0.8rem] text-faint">—</span>
                    ) : (
                      <select
                        aria-label={`Assign advisor to ${u.name}`}
                        defaultValue=""
                        disabled={pending}
                        onChange={(e) =>
                          e.target.value &&
                          act(u.id, { action: "assign_advisor", advisorId: e.target.value })
                        }
                        className="field py-1.5 text-[0.85rem]"
                      >
                        <option value="">Assign…</option>
                        {advisors.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    {self ? (
                      <span className="text-[0.8rem] text-faint">This is you</span>
                    ) : locked ? (
                      <span className="text-[0.8rem] text-faint">Restricted</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(u.id, {
                            action: u.status === "active" ? "suspend" : "activate",
                          })
                        }
                        className={cn(
                          "label rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
                          u.status === "active"
                            ? "border-line text-muted hover:border-red-400/50 hover:text-red-300"
                            : "border-moss-400/40 text-accent hover:border-moss-400"
                        )}
                      >
                        {u.status === "active" ? "Suspend" : "Activate"}
                      </button>
                    )}

                    {!self && !locked && (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(u.id, { action: "reset_password" })}
                          className="label ml-2 rounded-[var(--radius-sm)] border border-line px-3 py-1.5 text-muted transition-colors hover:border-moss-400/60 hover:text-accent"
                        >
                          Reset link
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

This cannot be undone. Suspend instead if you only want to block access.

Type DELETE to confirm.`
                              );
                              if (typed === "DELETE") act(u.id, { action: "delete" });
                            }}
                            className="label ml-2 rounded-[var(--radius-sm)] border border-line px-3 py-1.5 text-muted transition-colors hover:border-red-400/60 hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
                      </>
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

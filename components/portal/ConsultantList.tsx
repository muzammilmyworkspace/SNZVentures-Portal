"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Row, Cell, StatusPill } from "@/components/portal/Pieces";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import type { AdvisorLoad, AdvisorClient } from "@/lib/db/repos/portal";

/**
 * Consultants, what each one is carrying, and a way into either.
 *
 * Two controls per row, and they are deliberately different weights. "Details"
 * opens a panel — reading. "View as" leaves this page signed in as somebody
 * else — acting. A row where both look alike invites the second when the first
 * was meant.
 */

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-[18px] w-[18px]">
      <path
        d="M1.7 10S4.6 4.8 10 4.8 18.3 10 18.3 10 15.4 15.2 10 15.2 1.7 10 1.7 10z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-[17px] w-[17px]">
      <path
        d="M3.5 5.5h13M8 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 001.5 1.4h4.6a1.5 1.5 0 001.5-1.4l.7-10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function when(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ConsultantList({
  consultants,
  clients,
  canViewAs,
  canDelete,
  viewerId,
}: {
  consultants: AdvisorLoad[];
  clients: AdvisorClient[];
  /** Only a super admin may step into a consultant. See lib/auth/impersonation. */
  canViewAs: boolean;
  /** Deleting an account is super-admin only, enforced again on the server. */
  canDelete: boolean;
  /** Nobody operates on their own row — the admin API refuses it outright. */
  viewerId: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  /*
    A real <dialog>, opened with showModal(). Escape to close, focus kept
    inside and the rest of the page made inert come with it — all things a
    hand-built overlay has to reimplement and usually only half does.
  */
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (openId && !el.open) el.showModal();
    if (!openId && el.open) el.close();
  }, [openId]);

  useEffect(() => {
    const el = confirmRef.current;
    if (!el) return;
    if (confirmId && !el.open) el.showModal();
    if (!confirmId && el.open) el.close();
  }, [confirmId]);

  const open = consultants.find((c) => c.id === openId) ?? null;
  const openClients = openId ? clients.filter((c) => c.advisorId === openId) : [];
  const doomed = consultants.find((c) => c.id === confirmId) ?? null;

  /** One call for every row action the admin API already exposes. */
  async function act(id: string, body: Record<string, unknown>) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network problem. Please try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function viewAs(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't work.");
        return;
      }
      // A full navigation, not a router push: the session cookie changed, and
      // every cached server component on this page belongs to the old one.
      window.location.assign(data.redirectTo ?? "/portal");
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      <DataTable
        columns={[
          "Consultant",
          "Students",
          "Open",
          "Waiting on student",
          "Last signed in",
          "Active",
          "",
        ]}
        caption="Consultants and what each one is carrying"
        minWidth={980}
      >
        {consultants.map((c) => (
          <Row key={c.id}>
            <Cell>
              {c.name}
              <span className="mt-0.5 block text-[0.78rem] text-faint">{c.email}</span>
              {/* Only worth saying when it is not the expected one. */}
              {c.role !== "advisor" && (
                <span className="mt-1 inline-block text-[0.72rem] text-faint">
                  {ROLE_LABEL[c.role as Role]}
                </span>
              )}
            </Cell>
            <Cell>
              <span className="num">{c.clientCount}</span>
            </Cell>
            <Cell>
              <span className="num">{c.openCases}</span>
            </Cell>
            <Cell>
              <span className={c.needsAttention > 0 ? "num text-accent" : "num text-faint"}>
                {c.needsAttention}
              </span>
            </Cell>
            <Cell muted>{when(c.lastLoginAt)}</Cell>
            <Cell>
              {/*
                Suspension is the reversible control, and the one to reach for
                first — it blocks sign-in and leaves everything else standing.
                Your own row has no switch because the admin API refuses to
                operate on the caller, so an admin cannot lock themselves out.
              */}
              {c.id === viewerId ? (
                <span className="text-[0.8rem] text-faint">You</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.status === "active"}
                  aria-label={`${c.name} is ${c.status === "active" ? "active" : "inactive"}`}
                  disabled={busyId === c.id}
                  onClick={() =>
                    act(c.id, { action: c.status === "active" ? "suspend" : "activate" })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    c.status === "active" ? "bg-moss-400" : "bg-[var(--line)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-bg transition-transform ${
                      c.status === "active" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              )}
            </Cell>
            <Cell>
              <div className="flex items-center justify-end gap-2">
                {/*
                  Only for consultants, only when active, and only for a super
                  admin. The server refuses every other combination anyway —
                  this just declines to offer a button that cannot work.
                */}
                {canViewAs && c.role === "advisor" && c.status === "active" && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => viewAs(c.id)}
                    title={`Sign in as ${c.name}`}
                    className="label rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-1.5 text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    {busyId === c.id ? "…" : "View as"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  aria-label={`Details for ${c.name}`}
                  className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-line text-faint transition-colors hover:border-fg hover:text-fg"
                >
                  <EyeIcon />
                </button>

                {/* Deliberately last and deliberately quiet: the destructive
                    control should not be the one the eye lands on. */}
                {canDelete && c.id !== viewerId && (
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => {
                      setTyped("");
                      setConfirmId(c.id);
                    }}
                    aria-label={`Delete ${c.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-line text-faint transition-colors hover:border-[var(--danger-line)] hover:text-danger disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </Cell>
          </Row>
        ))}
      </DataTable>

      {/*
        DELETING A CONSULTANT.

        The dialog states the consequence rather than asking "are you sure",
        because the consequence is the part nobody has in mind: their students
        are NOT deleted, they are left with no consultant and land in
        Unassigned. Somebody who expects the students to go too, or expects
        them to stay attached, is wrong in a way a yes/no box never corrects.

        Typing the word is the same bar Users applies to the same cascade. It
        exists so this cannot happen by reflex on the wrong row — the rows here
        differ by an email address, and three of them can read "Muzammil".
      */}
      <dialog
        ref={confirmRef}
        onClose={() => setConfirmId(null)}
        onClick={(e) => {
          if (e.target === confirmRef.current) setConfirmId(null);
        }}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-bg p-0 text-fg backdrop:bg-[color-mix(in_srgb,var(--navy-950)_55%,transparent)]"
      >
        {doomed && (
          <div className="p-6">
            <h2 className="text-[1.05rem] font-semibold text-fg-strong">
              Delete {doomed.name}?
            </h2>
            <p className="mt-1 text-[0.85rem] text-muted">{doomed.email}</p>

            <div className="note-danger mt-4 p-3 text-[0.85rem] leading-relaxed">
              This cannot be undone.
              {doomed.clientCount > 0 ? (
                <>
                  {" "}
                  Their <strong className="font-semibold">{doomed.clientCount}</strong> student
                  {doomed.clientCount === 1 ? "" : "s"} will keep their accounts and documents,
                  but will be left with no consultant — you will find them under Unassigned.
                </>
              ) : (
                " They have no students, so nothing else is affected."
              )}
            </div>

            <p className="mt-3 text-[0.82rem] leading-relaxed text-muted">
              To block their access without losing anything, close this and turn off{" "}
              <strong className="font-semibold text-fg">Active</strong> instead.
            </p>

            <label htmlFor="confirm-delete" className="field-label mt-4 block">
              Type DELETE to confirm
            </label>
            <input
              id="confirm-delete"
              type="text"
              autoComplete="off"
              className="field"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={typed !== "DELETE" || busyId === doomed.id}
                onClick={async () => {
                  const id = doomed.id;
                  const done = await act(id, { action: "delete" });
                  if (done) setConfirmId(null);
                }}
                className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-5 text-danger transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {busyId === doomed.id ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={dialogRef}
        onClose={() => setOpenId(null)}
        /* Clicking the backdrop closes it: the click lands on the dialog
           element itself rather than on anything inside it. */
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpenId(null);
        }}
        className="w-[min(46rem,calc(100vw-2rem))] rounded-[var(--radius)] border border-line bg-bg p-0 text-fg backdrop:bg-[color-mix(in_srgb,var(--navy-950)_55%,transparent)]"
      >
        {open && (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <h2 className="text-[1.15rem] font-semibold text-fg-strong">{open.name}</h2>
                <p className="mt-0.5 text-[0.85rem] text-muted">{open.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="label min-h-11 px-2 text-muted transition-colors hover:text-fg"
              >
                Close
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.9rem] sm:grid-cols-4">
              <div>
                <dt className="label text-faint">Role</dt>
                <dd className="mt-0.5 text-fg">{ROLE_LABEL[open.role as Role]}</dd>
              </div>
              <div>
                <dt className="label text-faint">Status</dt>
                <dd className="mt-0.5">
                  <StatusPill
                    status={open.status}
                    label={open.status === "active" ? "Active" : "Suspended"}
                  />
                </dd>
              </div>
              <div>
                <dt className="label text-faint">Students</dt>
                <dd className="num mt-0.5 text-fg">{open.clientCount}</dd>
              </div>
              <div>
                <dt className="label text-faint">Last signed in</dt>
                <dd className="mt-0.5 text-fg">{when(open.lastLoginAt)}</dd>
              </div>
            </dl>

            <h3 className="label mt-6 text-faint">Their students</h3>
            {openClients.length === 0 ? (
              <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
                None yet. They enrol students by sending a link from Your students.
              </p>
            ) : (
              <div className="mt-2 max-h-[22rem] overflow-y-auto">
                <DataTable
                  columns={["Name", "Email", "Type", "Open cases"]}
                  caption={`Students assigned to ${open.name}`}
                  minWidth={520}
                >
                  {openClients.map((s) => (
                    <Row key={s.id}>
                      <Cell>{s.name}</Cell>
                      <Cell muted>{s.email}</Cell>
                      <Cell muted>{ROLE_LABEL[s.role as Role]}</Cell>
                      <Cell>
                        <span className="num">{s.openCases}</span>
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}

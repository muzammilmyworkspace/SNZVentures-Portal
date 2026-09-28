"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  consultants: AdvisorLoad[];
  clients: AdvisorClient[];
  /** Only a super admin may step into a consultant. See lib/auth/impersonation. */
  canViewAs: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  const open = consultants.find((c) => c.id === openId) ?? null;
  const openClients = openId ? clients.filter((c) => c.advisorId === openId) : [];

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
        columns={["Consultant", "Students", "Open", "Waiting on student", "Last signed in", ""]}
        caption="Consultants and what each one is carrying"
        minWidth={860}
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
              </div>
            </Cell>
          </Row>
        ))}
      </DataTable>

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

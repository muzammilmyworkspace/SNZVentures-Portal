"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Row, Cell, StatusPill } from "@/components/portal/Pieces";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";
import { Avatar } from "@/components/portal/Avatar";
import type { AdvisorLoad, AdvisorClient, StaffProfile } from "@/lib/db/repos/portal";

/**
 * Consultants, what each one is carrying, and a way into either.
 *
 * Three controls per row, at deliberately different weights. The switch is
 * reversible, the eye only reads, and delete is last and quiet. A row where
 * they all look alike invites the wrong one.
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

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-[18px] w-[18px]">
      <path
        d="M5.5 5.5l9 9M14.5 5.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
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

/** One headline figure in the panel's top row. */
function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rail p-3">
      <span className="label block text-faint">{label}</span>
      <span className="mt-1 block text-[0.95rem] text-fg">{value}</span>
    </div>
  );
}

/**
 * One contact field, shown even when empty.
 *
 * A dash rather than a hidden row: the reason to open this panel is usually to
 * find a phone number, and "there is no phone row" and "nobody has filled in a
 * phone number" look identical when empty fields are dropped. One of those is
 * something you can fix.
 */
function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-b border-line pb-2.5">
      <dt className="label text-faint">{label}</dt>
      <dd className={`mt-0.5 text-[0.9rem] ${value ? "text-fg" : "text-faint"}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

/** Must stay in step with EDITABLE in app/api/admin/staff — the server drops the rest. */
const FIELDS = [
  { key: "phone", label: "Phone number", type: "tel" },
  { key: "company", label: "Company name" },
  { key: "address_line", label: "Address" },
  { key: "city", label: "City" },
  { key: "postcode", label: "Zip / postcode" },
  { key: "country", label: "Country" },
] as const;

export function ConsultantList({
  consultants,
  clients,
  profiles,
  canViewAs,
  canDelete,
  canEdit,
  viewerId,
}: {
  consultants: AdvisorLoad[];
  clients: AdvisorClient[];
  profiles: StaffProfile[];
  /** Only a super admin may step into a consultant. See lib/auth/impersonation. */
  canViewAs: boolean;
  /** Deleting an account is super-admin only, enforced again on the server. */
  canDelete: boolean;
  /** So is rewriting the company and address a payment would be made out to. */
  canEdit: boolean;
  /** Nobody operates on their own row — the admin API refuses it outright. */
  viewerId: string;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
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
  const profile = openId ? profiles.find((p) => p.userId === openId) : undefined;
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

  async function saveDetails(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Those details didn't save.");
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
              <span className="flex items-start gap-3">
              <Avatar id={c.id} name={c.name} photo={c.avatarV != null} v={c.avatarV} size="md" />
              <span className="min-w-0">
              {c.name}
              <span className="mt-0.5 block text-[0.78rem] text-faint">{c.email}</span>
              {/* Only worth saying when it is not the expected one. */}
              {c.role !== "advisor" && (
                <span className="mt-1 inline-block text-[0.72rem] text-faint">
                  {ROLE_LABEL[c.role as Role]}
                </span>
              )}
              </span>
              </span>
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
                  /*
                    Green on, red off. Colour alone is never the message — the
                    knob's POSITION says the same thing, which is what a
                    red-green colour blind reader is left with, and what anyone
                    reads at a glance without decoding the palette.
                  */
                  className={`relative inline-flex h-7 w-[3.25rem] shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    c.status === "active" ? "bg-moss-400" : "bg-[var(--danger)]"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform ${
                      c.status === "active" ? "translate-x-[1.75rem]" : "translate-x-1"
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
                    aria-label={`View the portal as ${c.name}`}
                    data-tip="View as this consultant"
                    className="tip flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--danger-line)] text-danger transition-colors hover:bg-[var(--danger-soft)] disabled:opacity-50"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" />
                      <path d="M10 5l3 3-3 3M13 8H6" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setOpenId(c.id);
                  }}
                  aria-label={`Details for ${c.name}`}
                  data-tip="Details"
                  className="tip flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-line text-accent transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
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
                    data-tip="Delete consultant"
                    className="tip flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--danger-line)] text-danger transition-colors hover:bg-[var(--danger-soft)] disabled:opacity-50"
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
        className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-3rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius)] border border-line bg-bg p-0 text-fg shadow-2xl backdrop:bg-[color-mix(in_srgb,var(--color-navy-950)_70%,transparent)] backdrop:backdrop-blur-[2px]"
      >
        {doomed && (
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[1.05rem] font-semibold text-fg-strong">
                  Delete {doomed.name}?
                </h2>
                <p className="mt-1 truncate text-[0.85rem] text-muted">{doomed.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg"
              >
                <CrossIcon />
              </button>
            </div>

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
                  const done = await act(doomed.id, { action: "delete" });
                  if (done) setConfirmId(null);
                }}
                className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full border border-[var(--danger-line)] bg-[var(--danger-soft)] px-5 text-danger transition-opacity hover:opacity-80 disabled:opacity-40"
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
        onClose={() => {
          setOpenId(null);
          setEditing(false);
        }}
        /* Clicking the backdrop closes it: the click lands on the dialog
           element itself rather than on anything inside it. */
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpenId(null);
        }}
        className="fixed inset-0 m-auto h-fit max-h-[calc(100vh-3rem)] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius)] border border-line bg-bg p-0 text-fg shadow-2xl backdrop:bg-[color-mix(in_srgb,var(--color-navy-950)_70%,transparent)] backdrop:backdrop-blur-[2px]"
      >
        {open && (
          <div>
            {/* Sticky, so closing stays reachable without scrolling back up
                when a consultant has a long list of students below. */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-bg px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-[1.15rem] font-semibold text-fg-strong">
                  {open.name}
                </h2>
                <p className="mt-0.5 truncate text-[0.85rem] text-muted">{open.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg"
              >
                <CrossIcon />
              </button>
            </div>

            <div className="px-6 pb-6">
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <Figure label="Role" value={ROLE_LABEL[open.role as Role]} />
                <Figure
                  label="Status"
                  value={
                    <StatusPill
                      status={open.status}
                      label={open.status === "active" ? "Active" : "Suspended"}
                    />
                  }
                />
                <Figure label="Students" value={<span className="num">{open.clientCount}</span>} />
                <Figure label="Last signed in" value={when(open.lastLoginAt)} />
              </div>

              <div className="mt-6 flex items-center justify-between gap-4">
                <h3 className="label text-faint">Consultant details</h3>
                {canEdit && !editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        phone: profile?.phone ?? "",
                        company: profile?.company ?? "",
                        address_line: profile?.addressLine ?? "",
                        city: profile?.city ?? "",
                        postcode: profile?.postcode ?? "",
                        country: profile?.country ?? "",
                      });
                      setEditing(true);
                    }}
                    className="label text-accent underline underline-offset-4 transition-opacity hover:opacity-80"
                  >
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <form
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const done = await saveDetails(open.id);
                    if (done) setEditing(false);
                  }}
                >
                  {/*
                    Name and email are NOT here. Changing where somebody signs
                    in is a different act with its own consequences, and it
                    already has its own controls in Users — putting it beside a
                    postcode would make it look like the same kind of edit.
                  */}
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <label htmlFor={`f-${f.key}`} className="field-label">
                        {f.label}
                      </label>
                      <input
                        id={`f-${f.key}`}
                        type={"type" in f ? f.type : "text"}
                        className="field"
                        value={form[f.key] ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                  <div className="mt-1 flex flex-wrap items-center gap-3 sm:col-span-2">
                    <button
                      type="submit"
                      disabled={busyId === open.id}
                      className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
                    >
                      {busyId === open.id ? "Saving…" : "Save details"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Detail label="Full name" value={open.name} />
                  <Detail label="Email" value={open.email} />
                  <Detail label="Phone number" value={profile?.phone} />
                  <Detail label="Company name" value={profile?.company} />
                  <Detail label="Address" value={profile?.addressLine} />
                  <Detail label="City" value={profile?.city} />
                  <Detail label="Zip / postcode" value={profile?.postcode} />
                  <Detail label="Country" value={profile?.country} />
                </dl>
              )}

              <h3 className="label mt-7 text-faint">Their students</h3>
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
          </div>
        )}
      </dialog>
    </div>
  );
}

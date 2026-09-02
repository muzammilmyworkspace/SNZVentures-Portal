import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, isAdmin } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { NotConfigured } from "@/components/portal/NotConfigured";
import {
  PortalHeading,
  Panel,
  EmptyState,
  StatusPill,
  DataRow,
} from "@/components/portal/Pieces";
import { AdminNotes } from "@/components/portal/AdminNotes";
import { PortalAccess } from "@/components/portal/PortalAccess";
import { DriveExport } from "@/components/portal/DriveExport";
import { drivePanelFor } from "@/lib/db/repos/drive";
import * as usersRepo from "@/lib/db/repos/users";
import * as profilesRepo from "@/lib/db/repos/profiles";
import * as repo from "@/lib/db/repos/portal";
import * as ops from "@/lib/db/repos/operations";
import { intakeFor, PATHWAY_FOR_ROLE, type IntakeField } from "@/lib/portal/intake";
import { ROLE_LABEL, type Role } from "@/lib/auth/types";

export const metadata: Metadata = {
  title: "Client",
  robots: { index: false, follow: false },
};

/**
 * THE CLIENT FILE (§18, §19, §20)
 *
 * One page per client, covering everything staff need before a call: who they
 * are, what they submitted, what they have sent, where it stands, and the
 * internal record.
 *
 * ONE PAGE FOR ALL THREE AUDIENCES, not three near-identical ones. The intake
 * section renders from whichever definition matches the client's role, so a
 * new question added to the student form appears here with no change at all.
 * Three separate pages would each have to be remembered and edited.
 *
 * ADVISOR SCOPING: an advisor may only open a client assigned to them. That is
 * checked against staff_assignments in the database, not inferred from the UI.
 */

const STATUS_LABEL: Record<string, string> = {
  required: "Required",
  uploaded: "Uploaded",
  pending_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  needs_update: "Needs revision",
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  returned: "Returned",
};

/** Renders one saved answer, handling multi-selects and empty values. */
/**
 * One answer, as a line of text a person can read.
 *
 * Repeated blocks and document slots are objects. Passing them through
 * String() prints "[object Object]", and an array of them prints it once per
 * row — so the client file showed a wall of that where a student's education
 * history should be. They are summarised instead: everything the row actually
 * holds, in the order it was asked for.
 */
function answerOf(field: IntakeField, data: Record<string, unknown>) {
  const v = data[field.key];
  if (v === undefined || v === null) return null;

  if (field.type === "checkbox") return v === true ? "Yes" : null;

  if (field.type === "repeater") {
    const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    const lines = rows
      .map((row) =>
        (field.item ?? [])
          .map((sub) => String(row?.[sub.key] ?? "").trim())
          .filter(Boolean)
          .join(" · ")
      )
      .filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  }

  if (field.type === "documents") {
    const held = (v ?? {}) as Record<string, unknown>;
    const lines = Object.entries(held)
      .filter(([, name]) => typeof name === "string" && name.trim())
      .map(([slot, name]) => `${slot}: ${String(name)}`);
    return lines.length ? lines.join("\n") : null;
  }

  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (String(v).trim() === "") return null;
  return String(v);
}

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, role } = await requireStaff();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Client" />
        <NotConfigured what="Client records" />
      </>
    );
  }

  const user = await usersRepo.findById(id);
  if (!user) notFound();

  // An advisor sees only their own clients. Resolved in SQL; a 404 rather than
  // a 403 so the URL cannot be used to confirm an account exists.
  if (!isAdmin(role)) {
    const mine = await repo.getAssignedClients(session.userId);
    if (!mine.some((c) => c.id === id)) notFound();
  }

  const pathway = PATHWAY_FOR_ROLE[user.role as keyof typeof PATHWAY_FOR_ROLE];

  /*
    ONE statement for the whole file, not six behind a Promise.all.

    Six concurrent reads plus the user lookup and the layout's badges is eight
    round trips on a single connection to a database in another region — a 504.
    This page had never been opened by the test suite, so it had never shown it.
  */
  const file = await ops.getAdminUserFile(id, pathway ?? null);
  // One round trip, not two. Promise.all does not help on a single connection.
  const drive = await drivePanelFor(id);
  const profile = await profilesRepo.getProfile(id, user.role);
  const { documents, cases, intake, history, notes, consents } = file;

  const definition = pathway ? intakeFor(pathway) : null;

  return (
    <>
      <PortalHeading
        eyebrow={ROLE_LABEL[user.role as Role] ?? user.role}
        title={user.name}
        lead={user.email}
        action={
          <Link
            href="/portal/admin/users"
            className="label inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
          >
            All users
          </Link>
        }
        meta={
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[0.85rem]">
            <span className="text-muted">
              Status <StatusPill status={user.status} label={user.status} />
            </span>
            <span className="text-muted">
              <strong className="font-semibold text-fg">{documents.length}</strong> documents
            </span>
            <span className="text-muted">
              <strong className="font-semibold text-fg">{cases.length}</strong> cases
            </span>
            <span className="text-muted">
              Joined{" "}
              {new Date(user.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_23rem]">
        <div className="space-y-5">
          {/*
            Why their portal is open or shut. Students only — nobody else has
            a fee stage, so for them it would be a panel answering a question
            that cannot be asked.
          */}
          {user.role === "student" && <PortalAccess userId={id} />}

          {/* Sending a file out of the portal is a deliberate act by a named
              person, so the control lives on the file itself rather than in a
              bulk tool somewhere else. */}
          {documents.length > 0 && (
            <Panel title="Documents">
              <p className="text-[0.86rem] leading-relaxed text-muted">
                {documents.length} file{documents.length === 1 ? "" : "s"} on this file.
              </p>
              {/*
                One archive rather than one click per document. Named after the
                client, with the documents named as they were uploaded.
              */}
              <a
                href={"/api/admin/documents/zip?userId=" + id}
                className="label mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
              >
                Download all as .zip
              </a>
            </Panel>
          )}

          {isAdmin(role) && drive.connected && (
            <Panel title="Send to Google Drive">
              <DriveExport userId={id} existing={drive.export} />
            </Panel>
          )}

          {/* Submitted intake */}
          <Panel
            title={definition ? definition.title : "Intake"}
            action={
              intake ? (
                <StatusPill
                  status={intake.status}
                  label={STATUS_LABEL[intake.status] ?? intake.status}
                />
              ) : undefined
            }
          >
            {!definition ? (
              <p className="text-[0.9rem] text-muted">
                This account type has no intake form.
              </p>
            ) : !intake ? (
              <EmptyState
                icon="file"
                title="Not started"
                body="This client has not begun their form yet."
              />
            ) : (
              <div className="space-y-7">
                {definition.steps.map((step) => {
                  const answered = step.fields
                    .map((f) => ({ f, value: answerOf(f, intake.data) }))
                    .filter((x) => x.value !== null);
                  if (!answered.length) return null;
                  return (
                    <section key={step.key}>
                      <h3 className="label text-accent">{step.title}</h3>
                      <dl className="mt-3">
                        {answered.map(({ f, value }) => (
                          <div
                            key={f.key}
                            className="grid gap-1 border-b border-line py-2.5 last:border-0 sm:grid-cols-[14rem_1fr] sm:gap-4"
                          >
                            <dt className="text-[0.8rem] text-faint">{f.label}</dt>
                            <dd className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-fg">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  );
                })}
                {intake.submittedAt && (
                  <p className="border-t border-line pt-4 text-[0.8rem] text-faint">
                    Submitted{" "}
                    {new Date(intake.submittedAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            )}
          </Panel>

          {/* Documents */}
          <Panel
            title="Documents"
            action={
              <Link
                href="/portal/admin/documents"
                className="label text-faint transition-colors hover:text-accent"
              >
                Review queue
              </Link>
            }
          >
            {documents.length === 0 ? (
              <EmptyState icon="file" title="Nothing uploaded" body="No documents on file yet." />
            ) : (
              documents.map((d) => (
                <DataRow
                  key={d.id}
                  label={d.name}
                  value={<StatusPill status={d.status} label={STATUS_LABEL[d.status] ?? d.status} />}
                  meta={<span className="label text-faint">{d.category}</span>}
                />
              ))
            )}
          </Panel>

          {/* Cases */}
          <Panel title="Cases">
            {cases.length === 0 ? (
              <EmptyState icon="file" title="No cases" body="No case has been opened for this client." />
            ) : (
              cases.map((c) => (
                <DataRow
                  key={c.id}
                  label={c.title}
                  value={<StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />}
                  meta={
                    <span className="label text-faint">
                      {c.pathway}
                      {c.advisorName ? ` · ${c.advisorName}` : ""}
                    </span>
                  }
                />
              ))
            )}
          </Panel>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Panel title="Contact">
            <dl className="space-y-3 text-[0.85rem]">
              <div>
                <dt className="text-[0.8rem] text-faint">Email</dt>
                <dd className="mt-0.5 break-all text-fg">{user.email}</dd>
              </div>
              {Object.entries(profile ?? {})
                .filter(([, v]) => v && String(v).trim())
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[0.8rem] capitalize text-faint">
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd className="mt-0.5 text-fg">{String(v)}</dd>
                  </div>
                ))}
            </dl>
          </Panel>

          {/*
            THE SIGNED UNDERTAKING, on the file it belongs to.

            A consent recorded in a table nobody displays is a record that does
            no work: the first time it matters will be a dispute, and hunting
            for it in the database then is not a process. What is shown is what
            makes it evidence — the version of the wording that was on screen,
            the name the applicant typed, and when.

            The IP is stored but deliberately NOT displayed. It belongs in the
            record; putting it on a page staff read daily makes it ordinary
            personal data on show for no operational benefit.
          */}
          <Panel title="Signed consent">
            {consents.length === 0 ? (
              <p className="text-[0.85rem] leading-relaxed text-muted">
                No undertaking on file. Students accept one when they register;
                accounts created before that, or by staff, will not have one.
              </p>
            ) : (
              <ul className="space-y-4">
                {consents.map((c) => (
                  <li key={c.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                    <p className="text-[0.9rem] font-medium text-fg-strong">
                      {c.kind === "student_undertaking"
                        ? "Student Consent & Undertaking"
                        : c.kind.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1.5 text-[0.85rem] text-muted">
                      Signed <span className="text-fg">{c.signedName}</span>
                    </p>
                    <p className="mt-0.5 text-[0.8rem] text-faint">
                      {new Date(c.acceptedAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-0.5 text-[0.75rem] text-faint">Version {c.version}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="History">
            {history.length === 0 ? (
              <p className="text-[0.85rem] text-muted">Nothing recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="border-l border-line pl-3">
                    <p className="text-[0.85rem] text-fg">
                      {h.toStatus.replace(/_/g, " ")}
                      {h.internal && (
                        <span
                          className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[0.7rem] uppercase tracking-[0.1em] text-faint"
                          title="Not shown to the client"
                        >
                          internal
                        </span>
                      )}
                    </p>
                    {h.note && (
                      <p className="mt-0.5 text-[0.8rem] leading-relaxed text-muted">{h.note}</p>
                    )}
                    <p className="mt-0.5 text-[0.75rem] text-faint">
                      {new Date(h.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                      {h.actorName ? ` · ${h.actorName}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Internal notes">
            <AdminNotes subjectId={id} initialNotes={notes} viewerName={session.name} />
          </Panel>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { requireOpen } from "@/lib/portal/gate";
import { requireUser } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isStorageConfigured } from "@/lib/storage";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { getDocuments, REQUIRED_DOCUMENTS } from "@/lib/portal/data";
import { DocumentUploader } from "@/components/portal/DocumentUploader";
import {
  PortalHeading,
  Panel,
  DataRow,
  StatusPill,
  EmptyState,
} from "@/components/portal/Pieces";

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
};

/**
 * THE DOCUMENT CENTRE (§9)
 *
 * Answers the four questions a client actually has: what do you need from me,
 * what have I sent, where has it got to, and what needs redoing.
 *
 * The checklist and the uploads are merged into ONE list rather than shown as
 * two. Two lists means comparing them by eye to work out what is outstanding,
 * which is the job this page is supposed to do for them.
 *
 * `review_note` is shown ONLY for statuses that ask the client to act. An
 * approval note is an internal remark and stays internal.
 */

const STATUS_LABEL: Record<string, string> = {
  required: "Required",
  uploaded: "Uploaded",
  pending_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  needs_update: "Needs revision",
};

/** Statuses where the note explains something the client must do. */
const ACTIONABLE = new Set(["rejected", "needs_update"]);

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ replace?: string }>;
}) {
  /*
    Which document they came here to replace, named in the link from the panel
    above. Carried in the URL rather than in state so the link works from a
    notification email as well as from the page itself.
  */
  const replace = (await searchParams).replace ?? null;
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/documents");
  const { session } = await requireUser("/portal/documents");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Your file" title="Documents" lead="Everything you send us, in one place." />
        <NotConfigured />
      </>
    );
  }

  const documents = await getDocuments(session.userId);
  const required = REQUIRED_DOCUMENTS[session.role] ?? [];
  const storage = isStorageConfigured();

  // Merge checklist with reality. A required item the client has already sent
  // shows its real status; one they have not shows as outstanding.
  const uploadedNames = new Set(documents.map((d) => d.name.toLowerCase()));
  const outstanding = required.filter((r) => !uploadedNames.has(r.name.toLowerCase()));

  const needsAction = documents.filter((d) => ACTIONABLE.has(d.status));

  return (
    <>
      <PortalHeading
        eyebrow="Your file"
        title="Documents"
        lead="Everything you send us, in one place — with its review status."
        meta={
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[0.85rem]">
            <span className="text-muted">
              <strong className="font-semibold text-fg">{documents.length}</strong> uploaded
            </span>
            <span className="text-muted">
              <strong className="font-semibold text-fg">{outstanding.length}</strong> still needed
            </span>
            {needsAction.length > 0 && (
              <span className="text-accent">
                <strong className="font-semibold">{needsAction.length}</strong> need your attention
              </span>
            )}
          </div>
        }
      />

      {/* Anything the client must redo comes first — it is the only thing on
          this page that is blocked on them. */}
      {needsAction.length > 0 && (
        <div className="mb-5">
          <Panel accent title="Needs your attention">
            <ul className="space-y-4">
              {needsAction.map((d) => (
                <li key={d.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[0.95rem] font-medium text-fg">{d.name}</span>
                    <StatusPill status={d.status} label={STATUS_LABEL[d.status] ?? d.status} />
                  </div>
                  {/*
                    THE REASON, WORD FOR WORD. It is what a member of staff
                    wrote against this document, and it is the only thing that
                    tells somebody what to change — a status alone gets the
                    same file uploaded again.
                  */}
                  {d.reviewNote && (
                    <p className="mt-1.5 rounded-[var(--radius-sm)] border border-line bg-raised p-3 text-[0.85rem] leading-relaxed text-fg">
                      {d.reviewNote}
                    </p>
                  )}
                  <Link
                    href={`/portal/documents?replace=${encodeURIComponent(d.name)}#upload`}
                    className="label mt-2.5 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300"
                  >
                    Send a new copy
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
        <Panel title="Your documents" padded={false}>
          {documents.length === 0 && outstanding.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="file"
                title="No documents uploaded yet"
                body="Anything you send us appears here with its review status."
              />
            </div>
          ) : (
            <div className="p-5">
              {documents.map((d) => (
                <DataRow
                  key={d.id}
                  label={d.name}
                  value={<StatusPill status={d.status} label={STATUS_LABEL[d.status] ?? d.status} />}
                  meta={<span className="label text-faint">{d.category}</span>}
                />
              ))}
              {/*
                Required and optional are drawn differently on purpose. Several
                items on the student list only apply to some applicants — a
                Master's transcript means nothing to a school leaver — and a
                checklist where everything says "Required" either reads as a
                demand for documents that do not exist, or teaches people to
                ignore the word. Neither is what a checklist is for.
              */}
              {outstanding.map((r) => (
                <DataRow
                  key={r.name}
                  label={r.name}
                  value={
                    r.optional ? (
                      <StatusPill status="draft" label="If applicable" />
                    ) : (
                      <StatusPill status="required" label="Required" />
                    )
                  }
                  meta={<span className="label text-faint">{r.category}</span>}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={replace ? "Replace a document" : "Upload a document"}>
          <div id="upload" className="scroll-mt-24">
            {replace && (
              <p className="mb-4 note-ok p-3 text-[0.84rem] leading-relaxed">
                Replacing <strong className="font-semibold">{replace}</strong>. Your new copy is
                sent for review; the old one stays on your file as a record.
              </p>
            )}
            <DocumentUploader slots={required} configured={storage} replacing={replace} />
          </div>
        </Panel>
      </div>
    </>
  );
}

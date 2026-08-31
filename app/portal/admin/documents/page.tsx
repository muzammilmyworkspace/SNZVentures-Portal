import { requireStaff } from "@/lib/auth/guard";
import { getDocumentsForReview } from "@/lib/db/repos/portal";
import { isDatabaseConfigured } from "@/lib/db/client";
import { isStorageConfigured } from "@/lib/storage";
import { PortalHeading, Panel, EmptyState } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { DocumentReview } from "@/components/portal/DocumentReview";

export default async function AdminDocumentsPage() {
  await requireStaff();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Document review" />
        <NotConfigured what="Document review" />
      </>
    );
  }

  const documents = await getDocumentsForReview(100);

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Document review"
        lead="Approve, reject or request an update. The client is notified automatically."
      />
      {!isStorageConfigured() && (
        <div className="mb-5 rounded-[var(--radius-md)] border border-amber-400/35 bg-amber-400/[0.06] p-5">
          <p className="label text-amber-300">Storage not configured</p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-amber-100/80">
            Uploads are disabled and existing files cannot be downloaded until a
            storage transport is set. See DEPLOYMENT.md.
          </p>
        </div>
      )}
      <Panel padded={documents.length === 0}>
        {documents.length === 0 ? (
          <EmptyState
            icon="check"
            title="Nothing awaiting review"
            body="Documents clients upload appear here for approval."
          />
        ) : (
          <DocumentReview documents={documents} />
        )}
      </Panel>
    </>
  );
}

import Link from "next/link";
import { getDocumentsForOwner } from "@/lib/db/repos/portal";
import { findById } from "@/lib/db/repos/users";
import { Person } from "./Avatar";
import { StatusPill } from "./Pieces";
import { DocActions, ApproveAll } from "./DocActions";
import { EscapeTo } from "./EscapeTo";

/**
 * A STUDENT'S DOCUMENTS, beside the list they were opened from.
 *
 * Opened by `?docs=<user id>` on any pipeline page, so a reviewer reads the
 * application and checks the papers without leaving the queue. Half the
 * screen on a laptop, all of it on a phone.
 *
 * Preview is `?preview=<document id>` and shows in the top of the drawer:
 * images as images, PDFs in a frame, anything else as a download. The file
 * itself always comes through /api/portal/documents/[id], which checks who is
 * asking and mints a two-minute link; nothing here holds a storage key.
 *
 * "Download all" is the existing ZIP export, named after the student.
 */
export async function DocumentsDrawer({
  userId,
  previewId,
  baseHref,
}: {
  userId: string;
  previewId: string | null;
  /** The page's URL with `docs` set and no `preview`; closing drops `docs` too. */
  baseHref: { open: string; close: string };
}) {
  const [user, docs] = [await findById(userId), await getDocumentsForOwner(userId)];
  const files = docs.filter((d) => d.storageKey);
  const preview = previewId ? files.find((d) => d.id === previewId) ?? null : null;
  const withPreview = (id: string) => `${baseHref.open}${baseHref.open.includes("?") ? "&" : "?"}preview=${id}`;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="docs-title">
      <EscapeTo href={baseHref.close} />
      <Link
        href={baseHref.close}
        scroll={false}
        aria-label="Close documents"
        className="absolute inset-0 bg-[rgb(4_8_20/0.6)] backdrop-blur-[2px]"
      />
      <div className="relative flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden border-l border-line bg-[var(--panel-solid)] shadow-2xl lg:w-[50vw] lg:max-w-[50vw]">
        <header className="border-b border-line px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="docs-title" className="text-[1.15rem] font-semibold text-fg-strong">
              Documents
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ApproveAll
                userId={userId}
                waiting={files.filter((d) => d.status === "uploaded" || d.status === "pending_review").length}
              />
              {files.length > 0 && (
                <a
                  href={`/api/admin/documents/zip?userId=${userId}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-[0.85rem] font-semibold text-[#070B1A] transition-opacity hover:opacity-90"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                    <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" />
                  </svg>
                  Download all (ZIP)
                </a>
              )}
              <Link href={baseHref.close} scroll={false} aria-label="Close" data-tip="Close" className="tip tip-end icon-btn">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </Link>
            </div>
          </div>
          {user && (
            <div className="mt-4">
              <Person id={user.id} name={user.name} sub={`${user.email} · ${files.length} ${files.length === 1 ? "file" : "files"}`} size="md" />
            </div>
          )}
        </header>

        <div className="rail flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {preview && (
            <section className="mb-6 overflow-hidden rounded-[14px] border border-line">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] px-4 py-2.5">
                <p className="min-w-0 truncate text-[0.88rem] font-semibold text-fg">{preview.name}</p>
                <Link href={baseHref.open} scroll={false} className="label shrink-0 text-[0.7rem] text-faint hover:text-accent">
                  Close preview
                </Link>
              </div>
              {preview.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/portal/documents/${preview.id}`}
                  alt={preview.name}
                  className="mx-auto block max-h-[60vh] w-auto bg-[#0B1124] object-contain"
                />
              ) : preview.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/portal/documents/${preview.id}`}
                  title={preview.name}
                  className="block h-[62vh] w-full bg-white"
                />
              ) : (
                <p className="p-5 text-[0.9rem] text-muted">
                  This file type cannot be shown here.{" "}
                  <a href={`/api/portal/documents/${preview.id}?download=1`} className="text-accent underline underline-offset-4">
                    Download it
                  </a>{" "}
                  to open it.
                </p>
              )}
            </section>
          )}

          {files.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-line p-5 text-[0.9rem] text-muted">
              This student has not uploaded any documents yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)] rounded-[14px] border border-line">
              {files.map((d) => (
                <li
                  key={d.id}
                  className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3 ${d.id === previewId ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}
                >
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-line text-[0.6rem] font-bold uppercase text-muted">
                    {(d.mimeType?.split("/")[1] ?? "file").replace("vnd.openxmlformats-officedocument.", "").slice(0, 4)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9rem] text-fg">{d.name}</p>
                    <p className="text-[0.75rem] text-faint">
                      {d.category}
                      {d.sizeBytes ? ` · ${Math.max(1, Math.round(d.sizeBytes / 1024))} KB` : ""}
                    </p>
                    {d.reviewNote && d.status !== "approved" && (
                      <p className="mt-1 text-[0.78rem] leading-relaxed text-danger">Asked: {d.reviewNote}</p>
                    )}
                  </div>
                  <StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />
                  <Link
                    href={withPreview(d.id)}
                    scroll={false}
                    aria-label={`Preview ${d.name}`}
                    data-tip="Preview"
                    className="tip icon-btn"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                      <circle cx="8" cy="8" r="2" />
                    </svg>
                  </Link>
                  <a
                    href={`/api/portal/documents/${d.id}?download=1`}
                    aria-label={`Download ${d.name}`}
                    data-tip="Download"
                    className="tip icon-btn"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M2.5 13.5h11" />
                    </svg>
                  </a>
                  {/* Last, so its comment box opens below the whole row. */}
                  <DocActions id={d.id} name={d.name} status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

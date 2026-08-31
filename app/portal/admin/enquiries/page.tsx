import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLES } from "@/lib/auth/types";
import { listEnquiries } from "@/lib/db/repos/enquiries";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState, WorkCard, StatusPill } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Enquiries",
  description: "Contact-form enquiries from the public site.",
  path: "/portal/admin/enquiries",
  noIndex: true,
});

const PATHWAY_LABEL: Record<string, string> = {
  study: "Student",
  career: "Job Seeker",
  business: "Business",
  general: "General",
};

/**
 * ENQUIRIES FROM THE PUBLIC CONTACT FORM.
 *
 * These had nowhere to be seen at all. The form emailed them and stored
 * nothing, so with no mail transport configured every enquiry was written to a
 * server log and lost. They are now recorded first and emailed second, which
 * only helps if somebody can actually read them — hence this page.
 *
 * ADMIN ONLY, not staff. An enquiry carries a member of the public's name,
 * email, phone number and whatever they chose to tell us, before any
 * relationship exists and before they have an account. That is the narrowest
 * audience the business can operate with.
 *
 * `delivered = false` is shown prominently rather than hidden. An enquiry that
 * never reached an inbox is the one most likely to go unanswered, and the
 * operator needs to know the notification failed even though the record did not.
 */
export default async function EnquiriesPage() {
  await requireRole(ADMIN_ROLES, "/portal/admin/enquiries");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Enquiries" />
        <NotConfigured what="Enquiries" />
      </>
    );
  }

  const { rows, total, undelivered, unhandled } = await listEnquiries(100);

  return (
    <>
      <PortalHeading
        eyebrow="Staff"
        title="Enquiries"
        lead="Everyone who has used the contact form on the public site, newest first."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <WorkCard
          label="Not yet answered"
          value={unhandled}
          note={unhandled ? "Nobody has marked these as dealt with." : "Everything has been picked up."}
          href="/portal/admin/enquiries"
        />
        <WorkCard
          label="Email never sent"
          value={undelivered}
          note={
            undelivered
              ? "Recorded here, but the notification email did not go out."
              : "Every enquiry was also emailed."
          }
          href="/portal/admin/enquiries"
        />
        <WorkCard
          label="Total received"
          value={total}
          note="Since the contact form started recording them."
          href="/portal/admin/enquiries"
        />
      </div>

      <Panel title="All enquiries">
        {rows.length === 0 ? (
          <EmptyState
            icon="search"
            title="No enquiries yet"
            body="Anyone who fills in the contact form on the public site appears here, with everything they told us."
          />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Contact form enquiries</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Received", "Name", "Contact", "Looking for", "Email sent"].map((h) => (
                    <th key={h} scope="col" className="label pb-3 pr-4 text-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="py-3 pr-4 text-[0.85rem] text-faint">
                      {new Date(e.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-[0.9rem] text-fg">{e.name}</td>
                    <td className="py-3 pr-4 text-[0.85rem] text-muted">
                      <a
                        href={`mailto:${e.email}`}
                        className="inline-flex min-h-11 items-center break-all underline underline-offset-2 hover:text-accent"
                      >
                        {e.email}
                      </a>
                      {e.phone && <div className="text-[0.8rem] text-faint">{e.phone}</div>}
                    </td>
                    <td className="py-3 pr-4 text-[0.85rem] text-muted">
                      {PATHWAY_LABEL[e.pathway] ?? e.pathway}
                      {e.notes && (
                        <div className="mt-1 max-w-md text-[0.8rem] leading-relaxed text-faint">
                          {e.notes.slice(0, 180)}
                          {e.notes.length > 180 ? "…" : ""}
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <StatusPill
                        status={e.delivered ? "approved" : "needs_update"}
                        label={e.delivered ? "Sent" : "Not sent"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { ADMIN_ROLES } from "@/lib/auth/types";
import { listEnquiries } from "@/lib/db/repos/enquiries";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState, WorkCard, StatusPill, StatCard } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { buildMetadata } from "@/lib/seo";
import { Pager, paginate, pageFrom } from "@/components/portal/Pager";
import { SourceBadge, sourceLabel, PLACEMENT_LABEL } from "@/components/portal/SourceBadge";
import { BarList } from "@/components/portal/DashboardCharts";
import { Avatar } from "@/components/portal/Avatar";
import { whatsappLink } from "@/lib/portal/whatsapp";
import Link from "next/link";
import type { Enquiry } from "@/lib/db/repos/enquiries";

export const metadata: Metadata = buildMetadata({
  title: "Website enquiries",
  description: "Contact-form enquiries from the public site.",
  path: "/portal/admin/enquiries",
  noIndex: true,
});

const WA_PATH =
  "M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3zm4.4 12.2c-.2.6-1.1 1.1-1.6 1.2-.4 0-.9.1-2.9-.7-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.3.5-.3.6-.3h.5c.2 0 .4 0 .5.4l.8 1.8c.1.2.1.3 0 .5l-.4.5c-.1.2-.3.3-.1.6.2.3.7 1.1 1.5 1.8 1 .9 1.8 1.1 2.1 1.3.3.1.4.1.6-.1l.7-.9c.2-.2.3-.2.6-.1l1.7.8c.3.1.4.2.5.3 0 .2 0 .6-.2 1z";

/**
 * Message this person on WhatsApp, with a first line already written.
 * Disabled, with the reason on hover, when the number has no country code.
 */
function WhatsAppAction({ enquiry: e }: { enquiry: Enquiry }) {
  const first = e.name.trim().split(/\s+/)[0] ?? "";
  const href = whatsappLink(
    e.phone,
    `Hello ${first}, this is SnZ Ventures. Thank you for your enquiry on our website. When is a good time to talk?`
  );
  if (!href) {
    return (
      <span
        tabIndex={0}
        aria-label={e.phone ? "No country code on this number, so WhatsApp cannot open it" : "No phone number given"}
        data-tip={e.phone ? "Number has no country code" : "No phone number"}
        className="tip tip-end icon-btn inline-flex cursor-not-allowed opacity-40"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d={WA_PATH} />
        </svg>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Message ${e.name} on WhatsApp`}
      data-tip="Message on WhatsApp"
      className="tip tip-end icon-btn inline-flex !border-[#25D366]/50 !text-[#25D366] hover:!bg-[#25D366]/15"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={WA_PATH} />
      </svg>
    </a>
  );
}

const PATHWAY_LABEL: Record<string, string> = {
  study: "Student",
  career: "Job Seeker",
  careers: "Job Seeker",
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
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  await requireRole(ADMIN_ROLES, "/portal/admin/enquiries");

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Staff" title="Enquiries" />
        <NotConfigured what="Enquiries" />
      </>
    );
  }

  const { rows, total, undelivered, unhandled, whatsapp } = await listEnquiries(100);
  const pg = paginate(rows, pageFrom(sp.page), 20);
  const wg = paginate(whatsapp.recent, pageFrom(sp.wpage), 10);

  return (
    <>
      <PortalHeading
        eyebrow="From snzventures.com"
        title="Website enquiries"
        lead="People who contacted us directly through the website, before they have a portal account. Newest first, with where each one came from. WhatsApp chats started from the site are counted underneath."
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

      <Panel title="Direct enquiries from the website">
        {rows.length === 0 ? (
          <EmptyState
            icon="search"
            title="No enquiries yet"
            body="Anyone who fills in the contact form on the public site appears here, with everything they told us."
          />
        ) : (
          <div className="rail overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <caption className="sr-only">Contact form enquiries</caption>
              <thead>
                <tr className="border-b border-line">
                  {["#", "Received", "Name", "Contact", "Came from", "Looking for", "Email sent", ""].map((h, i) => (
                    <th key={h || i} scope="col" className="label pb-3 pr-4 text-faint">
                      {h || <span className="sr-only">Message</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((e, idx) => (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="py-3 pr-4 font-mono text-[0.8rem] text-faint">{(pg.page - 1) * pg.size + idx + 1}</td>
                    <td className="py-3 pr-4 text-[0.85rem] text-faint">
                      {new Date(e.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 text-[0.9rem] text-fg">
                      <span className="flex items-center gap-3">
                        <Avatar
                          id={e.accountId ?? e.id}
                          name={e.name}
                          photo={e.avatarV != null}
                          v={e.avatarV}
                          size="md"
                        />
                        {e.accountId ? (
                          <Link
                            href={`/portal/admin/users/${e.accountId}`}
                            className="underline-offset-4 hover:text-accent hover:underline"
                          >
                            {e.name}
                          </Link>
                        ) : (
                          e.name
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[0.85rem] text-muted">
                      <a
                        href={`mailto:${e.email}`}
                        className="inline-flex min-h-11 items-center break-all underline underline-offset-2 hover:text-accent"
                      >
                        {e.email}
                      </a>
                      {e.phone && <div className="text-[0.8rem] text-faint">{e.phone}</div>}
                      {e.whatsappAt && (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/15 px-2 py-0.5 text-[0.72rem] font-semibold text-accent">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
                          Also sent on WhatsApp
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[0.8rem] text-faint">
                      <SourceBadge source={e.source} />
                      {e.utm?.utm_campaign && (
                        <div className="mt-1.5 text-muted">Campaign: {e.utm.utm_campaign}</div>
                      )}
                      {e.page && (
                        <div className="mt-1">
                          Form on <span className="font-mono text-muted">{e.page}</span>
                        </div>
                      )}
                      {e.landing && e.landing !== e.page && (
                        <div>
                          Landed on <span className="font-mono text-muted">{e.landing}</span>
                        </div>
                      )}
                      {e.referrer && e.source === "other" && <div>via {e.referrer}</div>}
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
                    <td className="py-3 text-right">
                      <WhatsAppAction enquiry={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
<Pager inset page={pg.page} pages={pg.pages} total={pg.total} size={20} basePath="/portal/admin/enquiries" params={sp} noun="enquiries" />
      </Panel>

      {/* ------------------------------------------------------ WhatsApp */}
      <section className="mt-8" aria-labelledby="wa-heading">
        <h2 id="wa-heading" className="label mb-3.5 text-faint">WhatsApp chats started from the website</h2>
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <StatCard label="Last 7 days" value={whatsapp.last7} hint="Presses of a WhatsApp button on the site." />
          <StatCard label="Last 30 days" value={whatsapp.last30} hint="Each is somebody opening a chat with you." />
          <StatCard
            label="After a form"
            value={whatsapp.fromForm30}
            hint="Of the last 30 days: people who filled a form above, then sent it on WhatsApp too."
          />
        </div>

        <div className="dash-charts mb-5 grid items-stretch gap-5">
          <Panel title="Which button (30 days)">
            {whatsapp.byPlacement.length ? (
              <BarList
                title="WhatsApp presses by button"
                rows={whatsapp.byPlacement.map((r) => ({ label: PLACEMENT_LABEL[r.key] ?? r.key, value: r.n }))}
              />
            ) : (
              <p className="text-[0.9rem] text-muted">Nothing yet. Counting starts with this update.</p>
            )}
          </Panel>
          <Panel title="Where they came from (30 days)">
            {whatsapp.bySource.length ? (
              <BarList
                title="WhatsApp presses by source"
                rows={whatsapp.bySource.map((r) => ({ label: sourceLabel(r.key), value: r.n }))}
              />
            ) : (
              <p className="text-[0.9rem] text-muted">Nothing yet.</p>
            )}
          </Panel>
        </div>

        <Panel title="Latest WhatsApp presses" padded={whatsapp.recent.length === 0}>
          {whatsapp.recent.length === 0 ? (
            <EmptyState
              icon="search"
              title="No WhatsApp presses recorded yet"
              body="Every press of a WhatsApp button on the website is counted from now on, with the page and where the visitor came from. WhatsApp itself does not share the person's name or message."
            />
          ) : (
            <div className="rail overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <caption className="sr-only">Recent WhatsApp button presses</caption>
                <thead>
                  <tr className="border-b border-line">
                    {["#", "When", "Button", "Page", "Came from", "Campaign"].map((h) => (
                      <th key={h} scope="col" className="label px-5 py-3 text-faint">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wg.rows.map((c, idx) => (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 font-mono text-[0.8rem] text-faint">{(wg.page - 1) * wg.size + idx + 1}</td>
                      <td className="px-5 py-3 text-[0.85rem] text-faint">
                        {new Date(c.createdAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3 text-[0.85rem] text-fg">
                        {PLACEMENT_LABEL[c.placement ?? "page"] ?? c.placement}
                        {c.fromForm && <span className="ml-2 text-[0.75rem] text-accent">with a form</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-[0.8rem] text-muted">{c.page ?? "—"}</td>
                      <td className="px-5 py-3">
                        <SourceBadge source={c.source} />
                      </td>
                      <td className="px-5 py-3 text-[0.85rem] text-muted">{c.campaign ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            pageKey="wpage"
            page={wg.page}
            pages={wg.pages}
            total={wg.total}
            size={10}
            basePath="/portal/admin/enquiries"
            params={sp}
            noun="presses"
          />
        </Panel>
      </section>
    </>
  );
}

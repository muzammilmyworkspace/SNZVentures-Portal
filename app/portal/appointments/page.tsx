import Link from "next/link";
import { requireOpen } from "@/lib/portal/gate";
import { requireUser, isAdmin } from "@/lib/auth/guard";
import { onStudentDesk } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/client";
import { PortalHeading, Panel, EmptyState, StatusPill, Tabs } from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { allConsultations, consultationsFor, type Consultation } from "@/lib/db/repos/consultations";
import { ConsultationRequest, ConsultationSchedule } from "@/components/portal/ConsultationForms";
import { Person } from "@/components/portal/Avatar";
import { meetingTime, MODE_LABEL } from "@/lib/portal/meeting-time";
import { groupOf } from "@/lib/portal/member-id";

/**
 * CONSULTATIONS.
 *
 * Students and consultants ask SnZ Ventures for a meeting and see what they
 * have asked for. The team sees every request, gives each a day and time
 * (or moves, completes or cancels it); the requester is notified and
 * emailed with the time in Lithuania and Pakistan.
 */

const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for a time",
  confirmed: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  requested: "pending",
  confirmed: "approved",
  completed: "completed",
  cancelled: "rejected",
};

function When({ c }: { c: Consultation }) {
  if (!c.startsAt) {
    return <p className="text-[0.85rem] text-muted">{c.preferred ? `Prefers: ${c.preferred}` : "No preference given"}</p>;
  }
  return (
    <p className="text-[0.9rem] font-semibold text-fg">
      {meetingTime(c.startsAt)} · {c.durationMinutes} min
    </p>
  );
}

function Card({ c, staff }: { c: Consultation; staff: boolean }) {
  const upcoming = c.status === "confirmed";
  return (
    <li className="rounded-[14px] border border-line bg-[color-mix(in_srgb,var(--fg)_2%,transparent)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {staff ? (
            <span className="flex flex-wrap items-center gap-2">
              <Person id={c.requesterId} name={c.requesterName} sub={c.requesterEmail} size="md" />
              <span data-group={groupOf(c.requesterRole)} className="group-tag">
                {groupOf(c.requesterRole) === "consultant" ? "Consultant" : "Student"}
              </span>
            </span>
          ) : (
            <p className="text-[1rem] font-semibold text-fg-strong">{c.topic}</p>
          )}
        </div>
        <StatusPill status={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status]} />
      </div>
      <div className="mt-3 space-y-1">
        {staff && <p className="text-[0.95rem] font-semibold text-fg-strong">{c.topic}</p>}
        <When c={c} />
        <p className="text-[0.85rem] text-muted">
          {c.mode ? MODE_LABEL[c.mode] : "Any way"}
          {upcoming && c.meetingLink && (
            <>
              {" · "}
              {/^https?:\/\//.test(c.meetingLink) ? (
                <a href={c.meetingLink} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
                  Join the meeting
                </a>
              ) : (
                <span className="text-fg">{c.meetingLink}</span>
              )}
            </>
          )}
        </p>
        {c.notes && <p className="text-[0.82rem] leading-relaxed text-faint">“{c.notes}”</p>}
        {c.staffNote && (
          <p className="text-[0.82rem] leading-relaxed text-muted">
            <span className="text-faint">From SnZ Ventures:</span> {c.staffNote}
          </p>
        )}
        {staff && c.scheduledByName && c.startsAt && <p className="text-[0.75rem] text-faint">Booked by {c.scheduledByName}</p>}
      </div>
      {staff && (c.status === "requested" || c.status === "confirmed") && (
        <div className="mt-3 border-t border-line pt-3">
          <ConsultationSchedule id={c.id} mode={c.mode} scheduled={c.status === "confirmed"} />
        </div>
      )}
    </li>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Locked until the fee is verified for students. See lib/portal/gate.ts.
  await requireOpen("/portal/appointments");
  const { session } = await requireUser();
  const { tab } = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Contact" title="Consultations" />
        <NotConfigured what="Consultations" />
      </>
    );
  }

  const staff = isAdmin(session.role);

  if (!staff) {
    const mine = await consultationsFor(session.userId);
    return (
      <>
        <PortalHeading
          eyebrow="Contact"
          title="Consultations"
          lead="Ask SnZ Ventures for a meeting. Tell us what it is about and when suits you; we reply with a day and time, here and by email."
        />
        <Panel title="Book a consultation">
          <ConsultationRequest />
        </Panel>
        <Panel title="Your consultations" className="mt-5">
          {mine.length === 0 ? (
            <EmptyState icon="calendar" title="None yet" body="Your requests and booked meetings appear here." />
          ) : (
            <ul className="space-y-3">
              {mine.map((c) => (
                <Card key={c.id} c={c} staff={false} />
              ))}
            </ul>
          )}
        </Panel>
      </>
    );
  }

  // The student desk handles students' meetings only.
  const desk = await onStudentDesk(session);
  const all = (await allConsultations()).filter((c) => !desk || c.requesterRole === "student");
  const now = Date.now();
  const hourAgo = now - 60 * 60_000;
  const groups = {
    requested: all.filter((c) => c.status === "requested").reverse(),
    upcoming: all
      .filter((c) => c.status === "confirmed" && c.startsAt && new Date(c.startsAt).getTime() >= hourAgo)
      .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime()),
    past: all.filter(
      (c) =>
        c.status === "completed" ||
        c.status === "cancelled" ||
        (c.status === "confirmed" && c.startsAt && new Date(c.startsAt).getTime() < hourAgo)
    ),
  };
  const active = tab === "upcoming" || tab === "past" ? tab : "requested";
  const list = groups[active];

  return (
    <>
      <PortalHeading
        eyebrow="Contact"
        title="Consultations"
        lead="Meetings students and consultants have asked for. Give each a day and time; they are notified and emailed straight away."
      />
      <Tabs
        label="Consultations"
        active={active}
        items={[
          { key: "requested", label: "Waiting for a time", count: groups.requested.length, href: "/portal/appointments" },
          { key: "upcoming", label: "Upcoming", count: groups.upcoming.length, href: "/portal/appointments?tab=upcoming" },
          { key: "past", label: "Past", count: groups.past.length, href: "/portal/appointments?tab=past" },
        ]}
      />
      <Panel>
        {list.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={active === "requested" ? "No requests waiting" : active === "upcoming" ? "Nothing booked ahead" : "Nothing yet"}
            body="Requests from students and consultants appear here."
          />
        ) : (
          <ul className="space-y-3">
            {list.map((c) => (
              <Card key={c.id} c={c} staff />
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-4 text-[0.8rem] text-faint">
        Times are entered in your own time zone and shown to the requester in Lithuania and Pakistan time.{" "}
        <Link href="/portal/messages" className="underline underline-offset-4 hover:text-fg">
          Messages
        </Link>{" "}
        is the place for anything else.
      </p>
    </>
  );
}

import Link from "next/link";
import { requireOpen } from "@/lib/portal/gate";
import { requireUser } from "@/lib/auth/guard";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  PortalHeading,
  Panel,
  EmptyState,
  StatusPill,
  DataRow,
} from "@/components/portal/Pieces";
import { NotConfigured } from "@/components/portal/NotConfigured";
import { getAppointments } from "@/lib/portal/data";

export default async function Page() {
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/appointments");
  const { session } = await requireUser();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Contact" title="Appointments" />
        <NotConfigured what="Appointments" />
      </>
    );
  }

  const appointments = await getAppointments(session.userId);

  return (
    <>
      <PortalHeading
        eyebrow="Contact"
        title="Appointments"
        lead="Consultations, document reviews and check-ins with your advisor."
      />
      <Panel padded={appointments.length === 0}>
        {appointments.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No appointments scheduled"
            body="Request a consultation and we will confirm a time with an advisor."
            action={{ label: "Request by message", href: "/portal/messages" }}
          />
        ) : (
          <div className="p-5">
            {appointments.map((a) => (
              <DataRow
                key={a.id}
                label={a.type}
                value={<StatusPill status={a.status} label={a.status} />}
                meta={a.startsAt ? <span className="label text-faint">{new Date(a.startsAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : undefined}
              />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

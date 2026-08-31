import Link from "next/link";
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
import { getTasks } from "@/lib/portal/data";

export default async function Page() {
  const { session } = await requireUser();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Your file" title="Tasks" />
        <NotConfigured what="Task tracking" />
      </>
    );
  }

  const tasks = await getTasks(session.userId);

  return (
    <>
      <PortalHeading
        eyebrow="Your file"
        title="Tasks"
        lead="What we need from you, in the order it actually matters."
      />
      <Panel padded={tasks.length === 0}>
        {tasks.length === 0 ? (
          <EmptyState
            icon="check"
            title="Nothing outstanding"
            body="When your advisor needs something specific — a transcript, a confirmation, a decision — it appears here rather than getting lost in email."
          />
        ) : (
          <div className="p-5">
            {tasks.map((t) => (
              <DataRow
                key={t.id}
                label={t.title}
                value={<StatusPill status={t.status === "done" ? "approved" : "required"} label={t.status.replace(/_/g, " ")} />}
                meta={t.dueAt ? <span className="label text-faint">{new Date(t.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : undefined}
              />
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

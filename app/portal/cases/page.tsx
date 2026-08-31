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
import { getCases } from "@/lib/portal/data";
import { getClientHistory } from "@/lib/db/repos/operations";

export default async function Page() {
  // Locked until the fee is verified. See lib/portal/gate.ts.
  await requireOpen("/portal/cases");
  const { session } = await requireUser();

  if (!isDatabaseConfigured()) {
    return (
      <>
        <PortalHeading eyebrow="Your file" title="Applications & requests" />
        <NotConfigured what="Case tracking" />
      </>
    );
  }

  /*
    The case list and the client's own status history, read together.

    Without the history a client sees only where their case IS, never how it
    got there — and "under review" on its own tells them nothing about what
    changed or what was asked of them. getClientHistory scopes to this viewer
    and excludes internal entries in SQL.
  */
  const [cases, history] = await Promise.all([
    getCases(session.userId),
    getClientHistory(session.userId, 30),
  ]);

  return (
    <>
      <PortalHeading
        eyebrow="Your file"
        title="Applications & requests"
        lead="Everything we are working on for you, with a status and a named next action on each."
      />
      <Panel padded={cases.length === 0}>
        {cases.length === 0 ? (
          <EmptyState
            icon="file"
            title="Nothing open yet"
            body="When we begin preparing something with you — an application, a formation, a licence file — it appears here with its current status."
            action={{ label: "Start a conversation", href: "/portal/messages" }}
          />
        ) : (
          <div className="p-5">
            {cases.map((c) => (
              <DataRow
                key={c.id}
                label={c.title}
                value={<StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />}
                meta={<span className="label text-faint">{c.country ?? ""}</span>}
              />
            ))}
          </div>
        )}
      </Panel>

      {history.length > 0 && (
        <div className="mt-5">
          <Panel title="Status history">
            <ol className="space-y-4">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3.5">
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-moss-400/70"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.9rem] text-fg">
                      {h.toStatus.replace(/_/g, " ")}
                    </span>
                    {h.note && (
                      <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-muted">
                        {h.note}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[0.75rem] text-faint">
                      {new Date(h.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      )}

    </>
  );
}

import { studentStage } from "@/lib/portal/stage";
import { pathOpen, lockReason, type StudentStage } from "@/lib/portal/stage-rules";
import { feeHistoryFor } from "@/lib/db/repos/fees";
import { navFor } from "@/lib/portal/roles";
import { Panel } from "./Pieces";

/**
 * WHY THIS STUDENT'S PORTAL IS OPEN OR SHUT — for staff.
 *
 * Written after "I approved the fee and their portal is still locked", a
 * question nothing in the product could answer. The stage is derived from
 * rows rather than stored, which is the right design and makes it invisible:
 * there is no column anybody can go and look at.
 *
 * So it is computed here and shown, next to the rows it was computed FROM.
 * Every time this has come up the cause has been one of three things, and all
 * three are visible at a glance below:
 *
 *   • the submission was never approved — it is still sitting in the queue
 *   • it was approved, but on a different account with the same person's name
 *   • it was rejected, so there is no live claim at all
 *
 * Staff-only. It is on the client file, which advisors reach only for clients
 * assigned to them.
 */

const STAGE_LABEL: Record<StudentStage, string> = {
  fee_due: "Fee not submitted",
  fee_review: "Fee submitted — waiting for us",
  fee_rejected: "Fee returned to the student",
  application: "Fee verified — application open",
  consent_due: "Application submitted — undertaking left to sign",
  complete: "Everything open",
};

export async function PortalAccess({ userId }: { userId: string }) {
  const [{ stage }, history] = await Promise.all([
    studentStage(userId),
    feeHistoryFor(userId),
  ]);

  const locked = navFor.student
    .flatMap((g) => g.items)
    .filter((i) => !pathOpen(i.href, stage));

  const note = lockReason(stage);

  return (
    <Panel title="Portal access">
      <div className="space-y-5">
        <div>
          <p className="text-[0.95rem] font-semibold text-fg">{STAGE_LABEL[stage]}</p>
          {note && <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">{note}</p>}
        </div>

        <div>
          <p className="label mb-2 text-faint">
            {locked.length === 0 ? "Nothing is locked" : `Locked (${locked.length})`}
          </p>
          {locked.length === 0 ? (
            <p className="text-[0.85rem] text-muted">
              This student can reach every part of their portal.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {locked.map((i) => (
                <li
                  key={i.href}
                  className="rounded-[var(--radius-sm)] border border-line px-2.5 py-1 text-[0.8rem] text-muted"
                >
                  {i.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="label mb-2 text-faint">Fee submissions on this account</p>
          {history.length === 0 ? (
            <p className="text-[0.85rem] leading-relaxed text-muted">
              None. If a payment was approved for this person, it was on a
              different account — check the email address.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2 text-[0.85rem] last:border-0"
                >
                  <span className="font-semibold text-fg">{f.status}</span>
                  <span className="text-muted">
                    {f.currency} {f.amount} · {f.university}
                  </span>
                  <span className="text-faint">
                    {f.reviewedAt
                      ? `reviewed ${new Date(f.reviewedAt).toLocaleString()}`
                      : `submitted ${new Date(f.createdAt).toLocaleString()}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

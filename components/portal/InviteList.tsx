"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Row, Cell, StatusPill } from "@/components/portal/Pieces";
import type { InviteRow } from "@/lib/db/repos/invites";

/**
 * The life of every link this consultant has issued.
 *
 * Claimed and withdrawn rows STAY. This list is the evidence when two people
 * claim the same student, so it is a history and not a to-do list — a table
 * that quietly drops what it has finished with cannot answer the one question
 * it exists for.
 */

const LABEL: Record<InviteRow["status"], string> = {
  pending: "Waiting",
  claimed: "Enrolled",
  revoked: "Withdrawn",
  expired: "Expired",
};

/*
  Mapped onto the pill vocabulary Pieces already defines rather than adding
  new keys to it — an unknown status silently falls back to neutral there, so
  inventing one would look like a styling bug rather than fail.

  A withdrawn link is `cancelled`, not `withdrawn`: the latter is a danger tone
  in this palette, and deliberately withdrawing your own unused link is not a
  failure worth colouring red.
*/
const TONE: Record<InviteRow["status"], string> = {
  pending: "pending",
  claimed: "completed",
  revoked: "cancelled",
  expired: "closed",
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InviteList({
  invites,
  forConsultantId,
}: {
  invites: InviteRow[];
  forConsultantId?: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch("/api/portal/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, forConsultantId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      <DataTable
        columns={["Student", "For", "Created", "Status", ""]}
        caption="Enrolment links you have created"
        minWidth={760}
      >
        {invites.map((i) => (
          <Row key={i.id}>
            <Cell>
              {i.claimedByName ?? <span className="text-faint">Not used yet</span>}
              {i.note && <span className="mt-0.5 block text-[0.78rem] text-faint">{i.note}</span>}
            </Cell>
            <Cell muted>{i.email ?? "—"}</Cell>
            <Cell muted>{when(i.createdAt)}</Cell>
            <Cell>
              <StatusPill status={TONE[i.status]} label={LABEL[i.status]} />
            </Cell>
            <Cell>
              {/* Only a link that is still live can be withdrawn. An enrolment
                  that has happened is a fact about a student, not a draft. */}
              {i.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => revoke(i.id)}
                  disabled={busyId === i.id}
                  className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg disabled:opacity-50"
                >
                  {busyId === i.id ? "Withdrawing…" : "Withdraw"}
                </button>
              ) : (
                <span className="text-[0.8rem] text-faint">—</span>
              )}
            </Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}

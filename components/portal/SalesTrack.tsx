import { cn } from "@/lib/utils";
import type { SalesStudent } from "@/lib/db/repos/sales";

/**
 * A sales agent's view of ONE student: four checkpoints in a row.
 *
 *   Registered  ·  Fee  ·  Application  ·  Consent
 *
 * Each says its state in words as well as with its mark, so nothing is
 * colour-only: done (tick), waiting on us (clock), sent back (return), not yet
 * (empty). The student does all of this themselves; the agent only follows.
 */
type State = "done" | "wait" | "back" | "todo";

export function SalesTrack({ s }: { s: Pick<SalesStudent, "fee" | "application" | "consent"> }) {
  const fee: { state: State; text: string } =
    s.fee === "verified"
      ? { state: "done", text: "Verified" }
      : s.fee === "submitted"
        ? { state: "wait", text: "Checking" }
        : s.fee === "rejected"
          ? { state: "back", text: "Returned" }
          : { state: "todo", text: "Not paid yet" };
  const app: { state: State; text: string } =
    s.application === "submitted"
      ? { state: "done", text: "Submitted" }
      : s.application === "draft"
        ? { state: "wait", text: "Filling in" }
        : { state: "todo", text: s.fee === "verified" ? "Not started" : "After fee" };
  const consent: { state: State; text: string } = s.consent
    ? { state: "done", text: "Signed" }
    : { state: "todo", text: "Not signed" };

  const steps = [
    { label: "Registered", state: "done" as State, text: "Done" },
    { label: "Fee", ...fee },
    { label: "Application", ...app },
    { label: "Consent", ...consent },
  ];

  return (
    <ol className="pv4-track">
      {steps.map((st) => (
        <li key={st.label} className={cn("pv4-track-step", `is-${st.state}`)}>
          <span aria-hidden className="pv4-track-mark">
            <Mark state={st.state} />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.72rem] font-medium text-faint">{st.label}</span>
            <span className="block text-[0.8rem] font-semibold leading-tight">{st.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Mark({ state }: { state: State }) {
  const d: Record<State, string> = {
    done: "M3.5 7.2l2.2 2.2L10.5 4.6",
    wait: "M7 4v3l2 1.2",
    back: "M5 4.5L3 6.5l2 2M3 6.5h5a2.5 2.5 0 010 5H6.5",
    todo: "",
  };
  return state === "todo" ? null : (
    <svg viewBox="0 0 14 14" fill="none" className="h-3 w-3">
      <path d={d[state]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

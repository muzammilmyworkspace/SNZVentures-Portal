"use client";

import { useCallback, useState } from "react";
import {
  ADMISSION_CHECKLIST,
  VISA_CHECKLIST,
  VISA_CASE_NOTE,
  familyStatus,
  groupsFor,
  februaryRequirement,
  checklistProgress,
  type Checklist,
  type ChecklistGroup,
} from "@/lib/application/checklist";
import { cn } from "@/lib/utils";

/**
 * "WHICH DOCUMENTS DO I NEED?" — answered once, on screen.
 * ---------------------------------------------------------------------------
 * The requirements used to live in a PDF somebody had to find and send, which
 * is why the question kept being asked. Here they are tickable, they remember
 * what has been done, and they show only what applies to this applicant.
 *
 * WHY IT IS TICKABLE RATHER THAN PRINTED. A list of forty requirements read
 * once is a list nobody can hold. Ticked, it becomes a place to come back to —
 * and the count at the top is the answer to "how far off am I", which is the
 * second question they ask.
 *
 * NOTHING HERE IS REQUIRED TO SUBMIT. These are physical documents in a
 * queue at a Board office; making a submission depend on them would only teach
 * people to tick boxes to get past a screen. The ticks are their record, not
 * ours — and the attestation chains are the part worth the room, because that
 * is what actually sends applications back.
 *
 * IT SAVES ITSELF, one tick at a time, rather than riding along with a form.
 * The first version kept the ticks inside the application, which locks on
 * submission — so the checklist went read-only at exactly the point it starts
 * to matter, with the attestation, the Apostille and the entire visa list
 * still ahead. It now writes to its own store and works the same on the
 * standalone page, inside the form, and long after the file has gone in.
 */

function Ring({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * percent) / 100}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

function Group({
  group,
  ticked,
  onToggle,
}: {
  group: ChecklistGroup;
  ticked: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const done = group.items.filter((i) => ticked[i.id]).length;
  const complete = done === group.items.length;

  return (
    <section
      className={cn(
        "rounded-[var(--radius-md)] border transition-colors",
        complete ? "border-moss-400/45 bg-moss-400/[0.05]" : "border-line"
      )}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <span
          aria-hidden
          className={cn(
            "font-mono text-[0.72rem]",
            complete ? "text-ok" : "text-faint"
          )}
        >
          {String(group.number).padStart(2, "0")}
        </span>
        <h4 className="flex-1 text-[0.95rem] font-semibold text-fg">{group.title}</h4>
        <span className="label shrink-0 text-[0.6rem] text-faint">
          {done}/{group.items.length}
        </span>
      </header>

      <div className="px-4 py-3 sm:px-5">
        {group.lead && (
          <p className="mb-3 text-[0.82rem] leading-relaxed text-muted">{group.lead}</p>
        )}

        <ul className="space-y-1">
          {group.items.map((item) => {
            const on = Boolean(ticked[item.id]);
            return (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] py-2 transition-colors hover:bg-raised">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-moss-400"
                    checked={on}
                    onChange={() => onToggle(item.id)}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[0.87rem] leading-relaxed transition-colors",
                        on ? "text-faint line-through" : "text-fg"
                      )}
                    >
                      {item.text}
                    </span>
                    {item.detail && (
                      <span className="mt-0.5 block text-[0.78rem] leading-relaxed text-faint">
                        {item.detail}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {/*
          The attestation chain, drawn as a chain. It is the part that actually
          sends applications back, and reading it as a sentence hides the fact
          that the stamps happen in that order, at three different offices.
        */}
        {group.attestation && (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-line bg-raised px-3.5 py-3">
            <p className="label mb-2 text-[0.6rem] text-faint">Attestation required</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {group.attestation.chain.map((stamp, i) => (
                <span key={stamp} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span aria-hidden className="text-faint">
                      →
                    </span>
                  )}
                  <span className="rounded-full border border-moss-400/45 bg-moss-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-accent">
                    {stamp}
                  </span>
                </span>
              ))}
            </div>
            {group.attestation.notRequiredFor && (
              <p className="mt-2 text-[0.78rem] leading-relaxed text-faint">
                {group.attestation.notRequiredFor}
              </p>
            )}
          </div>
        )}

        {group.optional && (
          <p className="mt-3 text-[0.78rem] text-faint">Only if this applies to you.</p>
        )}
      </div>
    </section>
  );
}

function Board({
  checklist,
  applyLevel,
  ticked,
  onToggle,
}: {
  checklist: Checklist;
  applyLevel: string;
  ticked: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const groups = groupsFor(checklist, applyLevel);
  const progress = checklistProgress(checklist, applyLevel, ticked);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-[var(--radius-md)] border border-line bg-raised p-4">
        <Ring percent={progress.percent} />
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold text-fg">
            {progress.done} of {progress.total} ready
          </p>
          <p className="mt-0.5 text-[0.82rem] leading-relaxed text-muted">{checklist.lead}</p>
        </div>
      </div>

      {groups.map((group) => (
        <Group key={group.id} group={group} ticked={ticked} onToggle={onToggle} />
      ))}

      <div className="rounded-[var(--radius-md)] border border-amber-300/40 bg-amber-300/[0.06] p-4 sm:p-5">
        <p className="label mb-2.5 text-[0.6rem] text-warn">Scanning instructions</p>
        <ul className="space-y-2">
          {checklist.rules.map((rule) => (
            <li key={rule} className="flex gap-2.5 text-[0.84rem] leading-relaxed text-fg">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" />
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ChecklistBoard({
  applyLevel,
  intake,
  dependants = "",
  initialTicks,
}: {
  applyLevel: string;
  intake: string;
  /** Who is travelling, from section 07. Drives the family tab. */
  dependants?: string;
  initialTicks: Record<string, boolean>;
}) {
  const [tab, setTab] = useState<"admission" | "visa" | "family">("admission");
  const [ticked, setTicked] = useState<Record<string, boolean>>(initialTicks ?? {});
  const [failed, setFailed] = useState<string | null>(null);

  /*
    OPTIMISTIC, AND HONEST WHEN IT FAILS.

    A tick that waits for a round trip before moving feels broken on a list of
    thirty-one, and somebody working down it quickly would out-run the network.
    So the box moves at once — and if the save is refused, it moves back and
    says so, rather than leaving a tick on screen that is not in the database.
  */
  const toggle = useCallback(async (id: string) => {
    const next = !ticked[id];
    setTicked((t) => ({ ...t, [id]: next }));
    setFailed(null);
    try {
      const res = await fetch("/api/portal/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, on: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("refused");
    } catch {
      setTicked((t) => ({ ...t, [id]: !next }));
      setFailed("That didn't save. Check your connection and try again.");
    }
  }, [ticked]);

  const february = februaryRequirement(intake, applyLevel);
  const admission = checklistProgress(ADMISSION_CHECKLIST, applyLevel, ticked);
  const visa = checklistProgress(VISA_CHECKLIST, applyLevel, ticked);

  const family = familyStatus(dependants);

  const TABS = [
    { key: "admission" as const, label: "Admission", progress: admission },
    { key: "visa" as const, label: "Visa & residence", progress: visa },
    { key: "family" as const, label: "With family", progress: null },
  ];

  return (
    <div className="space-y-5">
      {/*
        THE FEBRUARY RULE, ADDRESSED TO THIS APPLICANT.

        The source states the rule and gives two examples, leaving somebody to
        work out which is theirs. We know the level they chose, so it names
        their own document. It appears only for a February intake — a
        requirement that does not apply is noise on a list this long.
      */}
      {february && (
        <div className="rounded-[var(--radius-md)] border border-moss-400/50 bg-moss-400/[0.08] p-4 sm:p-5">
          <p className="label mb-2 text-[0.6rem] text-accent">February intake · extra step</p>
          <p className="text-[0.9rem] leading-relaxed text-fg">{february.body}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              "inline-flex min-h-11 items-center gap-2.5 rounded-full border px-4 text-[0.85rem] transition-colors",
              tab === t.key
                ? "border-moss-400/70 bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] font-semibold text-accent"
                : "border-line text-muted hover:border-moss-400/40 hover:text-fg"
            )}
          >
            {t.label}
            {t.progress ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[0.66rem]",
                  t.progress.percent === 100
                    ? "bg-moss-400 text-navy-950"
                    : "bg-[color-mix(in_srgb,var(--fg)_10%,transparent)] text-faint"
                )}
              >
                {t.progress.done}/{t.progress.total}
              </span>
            ) : (
              /* A dot rather than a count: there is no list to be a fraction
                 of, and a "0/0" beside it would read as nothing to do. */
              family.travellingWithFamily && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              )
            )}
          </button>
        ))}
      </div>

      {tab === "admission" && (
        <Board
          checklist={ADMISSION_CHECKLIST}
          applyLevel={applyLevel}
          ticked={ticked}
          onToggle={toggle}
        />
      )}

      {tab === "visa" && (
        <div className="space-y-4">
          <Board
            checklist={VISA_CHECKLIST}
            applyLevel={applyLevel}
            ticked={ticked}
            onToggle={toggle}
          />

          <p className="rounded-[var(--radius-sm)] border border-line px-4 py-3 text-[0.84rem] leading-relaxed text-muted">
            {VISA_CASE_NOTE}
          </p>

          {/*
            A pointer, not the answer. Family had been a grey footnote at the
            bottom of this tab, which is where people stop reading — somebody
            could work the whole list and never learn their spouse was not
            covered by it. It has its own tab now; this is the signpost.
          */}
          <button
            type="button"
            onClick={() => setTab("family")}
            className="w-full rounded-[var(--radius-md)] border border-line bg-raised p-4 text-left transition-colors hover:border-moss-400/60 sm:p-5"
          >
            <p className="text-[0.9rem] font-semibold text-fg">
              Bringing a spouse or children?
            </p>
            <p className="mt-1.5 text-[0.84rem] leading-relaxed text-muted">
              This list covers you alone. Their documents are a separate one —{" "}
              <span className="text-accent underline underline-offset-4">see what applies</span>.
            </p>
          </button>
        </div>
      )}

      {tab === "family" && (
        <div className="space-y-4">
          <div
            className={cn(
              "rounded-[var(--radius-md)] border p-5 sm:p-6",
              family.travellingWithFamily
                ? "border-amber-300/45 bg-amber-300/[0.07]"
                : "border-line bg-raised"
            )}
          >
            <p className="text-[1rem] font-semibold text-fg">{family.headline}</p>
            <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">{family.body}</p>
          </div>

          {/*
            WE DO NOT LIST FAMILY DOCUMENTS, because we have not been given
            them. A family visa file turns on which country, which permit
            category and whose papers; a list invented here would look
            authoritative and be wrong, which is worse than the PDF this
            replaces. What it gives instead is the step that actually moves it.
          */}
          {family.travellingWithFamily ? (
            <div className="rounded-[var(--radius-md)] border border-line p-4 sm:p-5">
              <p className="label mb-2.5 text-[0.6rem] text-faint">What happens next</p>
              <ol className="space-y-3">
                {[
                  `Ask us for the family checklist. We prepare it for ${family.who} specifically, after looking at your case.`,
                  "Keep working through your own two lists in the meantime — yours is needed either way, and none of it is wasted.",
                  "Start any police certificates early. They are the slowest document in a family file, and every adult travelling needs their own.",
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[0.62rem] text-faint"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[0.86rem] leading-relaxed text-muted">{step}</span>
                  </li>
                ))}
              </ol>

              <a
                href="/portal/messages"
                className="label mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-moss-400 px-4 text-navy-950 transition-colors hover:bg-moss-300"
              >
                Ask for the family checklist
              </a>
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-line p-4 sm:p-5">
              <p className="text-[0.86rem] leading-relaxed text-muted">
                {family.answered
                  ? "Nothing extra to do here."
                  : "Answer \u201CWill family travel with you?\u201D in section 07 of your application and this page will say what applies to your case."}
              </p>
            </div>
          )}
        </div>
      )}

      {failed && (
        <p role="alert" className="text-[0.82rem] text-danger">
          {failed}
        </p>
      )}

      <p className="text-[0.78rem] leading-relaxed text-faint">
        Ticking these is for your own tracking — nothing here blocks your
        application. Each tick saves on its own, and this list stays open after
        your application has gone in, because the attestation and visa items
        come afterwards.
      </p>
    </div>
  );
}

import Link from "next/link";
import type { Session } from "@/lib/auth/types";
import { JOURNEYS } from "@/lib/auth/types";
import * as store from "@/lib/auth/store";
import {
  getCases,
  getTasks,
  getDocuments,
  getAppointments,
  profileCompletion,
  REQUIRED_DOCUMENTS,
} from "@/lib/portal/data";
import { getIntake } from "@/lib/db/repos/operations";
import { PATHWAY_FOR_ROLE, intakeFor, intakeCompletion } from "@/lib/portal/intake";
import { roleContext, portalRoleFor } from "@/lib/portal/roles";
import {
  PortalHeading,
  Panel,
  EmptyState,
  WorkCard,
  NextAction,
  JourneyTrack,
  ProgressRing,
  StatusPill,
  DataRow,
  CardLink,
} from "@/components/portal/Pieces";

/**
 * THE CLIENT DASHBOARD — one component, three audiences.
 * ---------------------------------------------------------------------------
 * Student, job seeker and business share a structure because they share a
 * question: where does my case stand and what is waiting on me. What differs is
 * vocabulary and which journey is drawn, both of which are data.
 *
 * Three separate dashboards would have been three places to fix the same bug.
 * The admin dashboard IS separate, because an operator's question is genuinely
 * different — many cases, which to open first — and forcing both into one
 * component would have produced something that served neither.
 *
 * EVERY FIGURE HERE IS READ FROM THE DATABASE. A new account correctly shows
 * zeros and empty states; nothing is padded to make the screen look busier.
 */

type ClientRole = "student" | "professional" | "business";

export async function ClientDashboard({ session }: { session: Session }) {
  const role = session.role as ClientRole;
  const portalRole = portalRoleFor(role);
  const ctx = roleContext[portalRole];

  const pathway = PATHWAY_FOR_ROLE[role as keyof typeof PATHWAY_FOR_ROLE];

  const [user, cases, tasks, documents, appointments, intake] = await Promise.all([
    store.findById(session.userId),
    getCases(session.userId),
    getTasks(session.userId),
    getDocuments(session.userId),
    getAppointments(session.userId),
    pathway ? getIntake(session.userId, pathway) : Promise.resolve(null),
  ]);

  const completion = profileCompletion(role, user?.profile ?? {});
  const journey = JOURNEYS[role];
  const required = REQUIRED_DOCUMENTS[role] ?? [];

  const openTasks = tasks.filter((t) => t.status !== "done");
  const actionDocs = documents.filter(
    (d) => d.status === "rejected" || d.status === "needs_update"
  );
  const intakeDone = Boolean(intake && intake.status !== "draft");
  const intakePercent =
    pathway && intake ? intakeCompletion(intakeFor(pathway), intake.data).percent : 0;

  /**
   * The next step, derived from real state in priority order.
   *
   * Ordered by what actually blocks progress: a returned document stops an
   * application dead, an unfinished form stops it starting, a task is a named
   * request from an advisor, and only when none of those are outstanding does
   * booking a conversation become the most useful thing to say.
   */
  const nextStep = actionDocs.length
    ? {
        title: `${actionDocs[0].name} needs attention`,
        body:
          actionDocs[0].reviewNote ??
          "This document was returned. Replacing it lets your case continue.",
        href: "/portal/documents",
        cta: "Upload replacement",
      }
    : !intakeDone
      ? {
          title: intake ? "Finish your application" : "Start your application",
          body: intake
            ? `You're ${intakePercent}% through. It saves as you go, so you can stop and come back.`
            : "A short set of questions so we can advise on your actual case rather than a general one.",
          href: "/portal/application",
          cta: intake ? "Continue" : "Start now",
        }
      : openTasks.length
        ? {
            title: openTasks[0].title,
            body: openTasks[0].detail ?? "Open this task for the detail.",
            href: "/portal/tasks",
            cta: "View tasks",
          }
        : completion.percent < 100
          ? {
              title: "Complete your profile",
              body: `${completion.filled} of ${completion.total} details so far. The rest is what turns a general answer into one about your case.`,
              href: "/portal/profile",
              cta: "Continue your profile",
            }
          : {
              title: "Book a conversation",
              body: "Everything we need is on file. The next step is a short call so we can tell you honestly what your options look like.",
              href: "/portal/appointments",
              cta: "Request a consultation",
            };

  const firstName = session.name.split(" ")[0];
  const casesLabel = role === "business" ? "Requests" : "Applications";

  return (
    <>
      <PortalHeading
        eyebrow={ctx.eyebrow}
        title={`Welcome back, ${firstName}.`}
        lead={ctx.lead}
      />

      <NextAction {...nextStep} />

      {/*
        THE FOUR NUMBERS, EACH WITH THE WORDS THAT MAKE IT MEAN SOMETHING.

        These were bare figures under the heading — "Documents 0", "Open tasks
        0" — which on a new account is a row of zeros that explains nothing and
        looks broken. A count with no sentence beside it asks the reader to
        work out both what it counts AND whether it is good news.

        They sit BELOW the next step on purpose. The next step is the answer to
        "what do I do now"; these are the answer to "where does my case stand",
        which is the second question, not the first.
      */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <WorkCard
          label="Documents needing you"
          value={actionDocs.length}
          note={
            actionDocs.length
              ? "Returned by your advisor — replacing them lets your case continue."
              : `${documents.length} on file. Nothing has been sent back.`
          }
          href="/portal/documents"
        />
        <WorkCard
          label="Open tasks"
          value={openTasks.length}
          note={
            openTasks.length
              ? "Things your advisor has asked you for."
              : "Nothing outstanding. Tasks appear here when we need something."
          }
          href="/portal/tasks"
        />
        <WorkCard
          label={casesLabel}
          value={cases.length}
          note={
            cases.length
              ? "Open with us, each with a status and a named next step."
              : role === "business"
                ? "Requests you raise with us will be tracked here."
                : "Applications we prepare with you will be tracked here."
          }
          href="/portal/cases"
        />
        <WorkCard
          label="Consultations"
          value={appointments.length}
          note={
            appointments.length
              ? "Booked with your advisor."
              : "No calls booked. You can request one at any time."
          }
          href="/portal/appointments"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
        <Panel
          title={role === "business" ? "Where your setup stands" : "Where you are"}
          action={<CardLink href="/portal/journey">See each stage</CardLink>}
        >
          {/* current = -1 until an advisor sets a stage — the honest default */}
          <JourneyTrack stages={journey} current={-1} compact />
          <p className="mt-6 border-t border-line pt-4 text-[0.8rem] leading-relaxed text-faint">
            Your current stage is set by your advisor as the case progresses.
          </p>
        </Panel>

        <Panel title="Profile completion">
          <ProgressRing
            value={completion.percent}
            label={
              completion.percent === 100
                ? "Complete — thank you. This makes our assessment far more useful."
                : `${completion.total - completion.filled} details still to add.`
            }
          />
          {completion.missing.length > 0 && (
            <ul className="mt-6 space-y-2 border-t border-line pt-5">
              {completion.missing.slice(0, 4).map((m) => (
                <li key={m} className="flex items-center gap-2.5 text-[0.85rem] text-muted">
                  <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                  {m}
                </li>
              ))}
              {completion.missing.length > 4 && (
                <li className="text-[0.8rem] text-faint">
                  +{completion.missing.length - 4} more
                </li>
              )}
            </ul>
          )}
          <Link
            href="/portal/profile"
            className="label mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-fg transition-colors hover:border-moss-400/60 hover:text-accent"
          >
            Complete profile
          </Link>
        </Panel>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Panel title={casesLabel} action={<CardLink href="/portal/cases">View all</CardLink>}>
          {cases.length === 0 ? (
            <EmptyState
              icon="file"
              title="Nothing open yet"
              body={
                role === "business"
                  ? "Requests you raise with us appear here, each with a status and a named next action."
                  : "Applications we prepare with you appear here, each with a status and a named next action."
              }
              action={{ label: "Talk to us", href: "/portal/messages" }}
            />
          ) : (
            cases.slice(0, 5).map((c) => (
              <DataRow
                key={c.id}
                label={c.title}
                value={<StatusPill status={c.status} label={c.status.replace(/_/g, " ")} />}
                meta={<span className="label text-faint">{c.country ?? c.pathway}</span>}
              />
            ))
          )}
        </Panel>

        <Panel title="Documents" action={<CardLink href="/portal/documents">View all</CardLink>}>
          {documents.length === 0 ? (
            <div>
              <p className="mb-4 text-[0.85rem] leading-relaxed text-muted">
                Nothing uploaded yet. For your pathway we typically need:
              </p>
              {/* Genuinely-required first: the list is long for students and
                  the first five are what someone will actually act on. */}
              {required
                .filter((d) => !d.optional)
                .slice(0, 5)
                .map((d) => (
                  <DataRow
                    key={d.name}
                    label={d.name}
                    value={<StatusPill status="required" label="Required" />}
                    meta={<span className="label text-faint">{d.category}</span>}
                  />
                ))}
            </div>
          ) : (
            documents.slice(0, 5).map((d) => (
              <DataRow
                key={d.id}
                label={d.name}
                value={<StatusPill status={d.status} label={d.status.replace(/_/g, " ")} />}
                meta={<span className="label text-faint">{d.category}</span>}
              />
            ))
          )}
        </Panel>
      </div>
    </>
  );
}

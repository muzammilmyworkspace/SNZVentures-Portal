import type { StudentStage } from "./stage-rules";

/**
 * THE STUDENT ROUTE, AS IT ACTUALLY RUNS.
 * ---------------------------------------------------------------------------
 * The old journey was seven generic stages with no current position — an
 * advisor was supposed to set one and never did, so every student saw the same
 * inert list with nothing marked. A progress track that never moves is worse
 * than none: it teaches people that the portal does not know anything.
 *
 * These stages are the real sequence, and the first four are DERIVED from the
 * same rows the gate reads. They cannot disagree with what a student can
 * actually reach.
 *
 * The last three are honestly marked as advisor-driven. We know when a fee is
 * verified and when a form is submitted; we do not know when a university
 * replies until somebody tells us, and inventing a position there would be a
 * promise the system cannot keep.
 */

export type FlowState = "done" | "current" | "waiting" | "upcoming";

export type FlowStage = {
  key: string;
  name: string;
  description: string;
  /** What the student does here, when it is their move. */
  action?: { label: string; href: string };
  /** True where progress depends on us or a university, not on them. */
  advisorLed?: boolean;
};

export const STUDENT_FLOW: FlowStage[] = [
  {
    key: "enquiry",
    name: "Enquiry & consultation",
    description:
      "We talk through where you want to study, what you have, and what it will cost — before any money changes hands.",
  },
  {
    key: "fee",
    name: "Fee & verification",
    description:
      "The upfront fee is paid, you send us the receipt, and we check it against our bank. This is what opens the rest of your portal.",
    action: { label: "Submit your receipt", href: "/portal/student" },
  },
  {
    key: "application",
    name: "Your application",
    description:
      "Ten sections covering everything a European university asks for, including your documents, ending with the undertaking you sign. Save as you go — nothing is lost between visits.",
    action: { label: "Open my application", href: "/portal/application" },
  },
  {
    key: "consent",
    name: "Consent & undertaking",
    description:
      "The document that authorises us to submit your file to universities and immigration authorities. It is the last section of your application — nothing is sent until you have signed it.",
    action: { label: "Open my application", href: "/portal/application" },
  },
  {
    key: "submission",
    name: "Submitted to universities",
    description:
      "Your advisor checks the file, then sends it to each institution in your priority order.",
    advisorLed: true,
  },
  {
    key: "offer",
    name: "Offer & acceptance",
    description:
      "Decisions come back, we go through them with you, and you accept the one you want.",
    advisorLed: true,
  },
  {
    key: "visa",
    name: "Visa & residence permit",
    description:
      "Admission letter, appointment, and the permit file. We tell you what each embassy asks for.",
    advisorLed: true,
  },
];

/** Where the student stands, and why. */
export function flowPosition(stage: StudentStage): {
  index: number;
  note: string;
  waiting: boolean;
} {
  switch (stage) {
    case "fee_due":
      return {
        index: 1,
        waiting: false,
        note: "Send us your payment receipt and the rest of your portal opens.",
      };
    case "fee_review":
      return {
        index: 1,
        waiting: true,
        note: "We are checking your receipt. This usually takes one working day, and we will email you.",
      };
    case "fee_rejected":
      return {
        index: 1,
        waiting: false,
        note: "There was a problem with your receipt — the reason is on your dashboard. Send it again and we will re-check it.",
      };
    case "application":
      return {
        index: 2,
        waiting: false,
        note: "Your fee is verified. The application form is open, saves as you go, and ends with the undertaking you sign.",
      };
    case "consent_due":
      return {
        index: 3,
        waiting: false,
        note: "Your answers are in. The undertaking at the end of the form is the last thing to sign before we can send anything.",
      };
    case "complete":
      return {
        index: 4,
        waiting: true,
        note: "Everything you need to do is done. From here your advisor drives it, and you will hear from us at each decision.",
      };
  }
}

export function stateOf(index: number, current: number, waiting: boolean): FlowState {
  if (index < current) return "done";
  if (index > current) return "upcoming";
  return waiting ? "waiting" : "current";
}

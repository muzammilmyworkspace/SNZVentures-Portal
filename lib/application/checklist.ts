/**
 * THE DOCUMENT & ATTESTATION CHECKLIST.
 * ---------------------------------------------------------------------------
 * "Which documents do I need?" is the question students ask most, and the
 * honest answer has always been a PDF somebody had to find and send. It is
 * here instead, as data, so it can do the one thing a PDF cannot: show the
 * applicant only what applies to them.
 *
 * IT ADAPTS FROM ANSWERS THEY HAVE ALREADY GIVEN. A Bachelor's applicant is
 * not asked for a degree they do not have; the February apostille rule appears
 * only for the February intake, and names their own last qualification rather
 * than explaining the general rule and leaving them to work it out.
 *
 * NOTHING HERE IS INVENTED. The requirements, the attestation chains and the
 * scanning rules are SnZ Ventures' own document, reproduced. Where the source
 * says a score depends on the university, this says that too rather than
 * picking a number — a checklist that states a requirement more precisely than
 * the institution does is a checklist that will be wrong for somebody.
 */

export type Attestation = {
  /** What must be attested, and by whom, in order. */
  chain: string[];
  /** Documents in the same group that need none. */
  notRequiredFor?: string;
};

export type ChecklistItem = {
  id: string;
  text: string;
  /** Shown smaller, under the item. */
  detail?: string;
};

export type ChecklistGroup = {
  id: string;
  number: number;
  title: string;
  /** One line before the items. */
  lead?: string;
  items: ChecklistItem[];
  attestation?: Attestation;
  /**
   * When this group applies. Absent means always.
   *   level    — matched against the study level chosen in section 01
   *   optional — shown, but marked as "only if it applies to you"
   */
  onlyForLevel?: "postgraduate";
  optional?: boolean;
};

export type Checklist = {
  id: "admission" | "visa";
  title: string;
  lead: string;
  groups: ChecklistGroup[];
  /** The scanning rules that close each document. */
  rules: string[];
};

/* ═════════════════════════════════════════ admission & attestation ═══ */

export const ADMISSION_CHECKLIST: Checklist = {
  id: "admission",
  title: "Admission document & attestation checklist",
  lead: "All applicants are required to provide clear, complete, and properly scanned documents according to the following requirements.",
  groups: [
    {
      id: "passport",
      number: 1,
      title: "Passport",
      items: [
        { id: "passport-pages", text: "First 4 pages of the passport" },
        { id: "passport-signed", text: "Passport must be signed by the applicant" },
        { id: "passport-colour", text: "Clear colour scan" },
        { id: "passport-visible", text: "All information must be fully visible" },
      ],
    },
    {
      id: "photo",
      number: 2,
      title: "Passport-size photograph",
      items: [
        { id: "photo-recent", text: "Recent passport-size photograph" },
        { id: "photo-white", text: "White background" },
        { id: "photo-quality", text: "Clear, high-quality image" },
      ],
    },
    {
      id: "cnic",
      number: 3,
      title: "NIC / CNIC",
      items: [
        { id: "cnic-colour", text: "Clear colour scan" },
        { id: "cnic-sides", text: "Front and back must both be provided" },
        { id: "cnic-readable", text: "All information must be clearly readable" },
      ],
    },
    {
      id: "english",
      number: 4,
      title: "English language proficiency",
      lead: "Applicants must provide one of the following:",
      items: [
        {
          id: "english-ielts",
          text: "IELTS: 5.5–6.0 bands",
          detail: "The band required depends on the university and the study programme.",
        },
        { id: "english-pte", text: "Or an equivalent PTE score" },
        {
          id: "english-other",
          text: "Other English proficiency evidence",
          detail: "Accepted only where permitted by the respective university.",
        },
      ],
    },
    {
      id: "ssc",
      number: 5,
      title: "SSC / Matric documents",
      items: [
        { id: "ssc-certificate", text: "SSC / Matric certificate" },
        { id: "ssc-result", text: "SSC / Matric result card" },
      ],
      attestation: {
        chain: ["Board", "IBCC", "MOFA"],
        notRequiredFor: "The result card needs no attestation.",
      },
    },
    {
      id: "hssc",
      number: 6,
      title: "HSC / FA / FSc / Intermediate documents",
      items: [
        { id: "hssc-certificate", text: "HSC / Intermediate certificate" },
        { id: "hssc-result", text: "HSC / Intermediate result card" },
      ],
      attestation: {
        chain: ["Board", "IBCC", "MOFA"],
        notRequiredFor: "The result card needs no attestation.",
      },
    },
    {
      id: "bachelor",
      number: 7,
      title: "Bachelor's degree",
      lead: "For applicants who have completed a Bachelor's degree:",
      optional: true,
      items: [
        { id: "bachelor-certificate", text: "Bachelor's degree certificate" },
        { id: "bachelor-transcript", text: "Complete academic transcript" },
      ],
      attestation: { chain: ["HEC", "MOFA"] },
    },
    {
      id: "master",
      number: 8,
      title: "Master's degree",
      lead: "If applicable:",
      optional: true,
      onlyForLevel: "postgraduate",
      items: [
        { id: "master-certificate", text: "Master's degree certificate" },
        { id: "master-transcript", text: "Complete academic transcript" },
      ],
      attestation: { chain: ["HEC", "MOFA"] },
    },
  ],
  rules: [
    "Every document must be scanned separately.",
    "Documents must be scanned in colour and high quality.",
    "For any two-sided document, both front and back must be scanned and clearly visible.",
    "All Board, IBCC, HEC, MOFA and Apostille / Legalization stamps must be completely visible.",
    "Do not crop stamps, signatures, document numbers, QR codes or document edges.",
    "Blurred, incomplete, cropped or partially visible documents will not be accepted for processing.",
    "Ensure that the applicant's name, date of birth and other personal information are consistent across all documents.",
  ],
};

/* ═══════════════════════════════════════════════ visa & residence ═══ */

export const VISA_CHECKLIST: Checklist = {
  id: "visa",
  title: "Visa document checklist",
  lead: "Required for the visa / residence application stage. All documents must be clear, complete, and properly scanned.",
  groups: [
    {
      id: "pcc",
      number: 1,
      title: "Police Clearance Certificate (PCC)",
      items: [
        { id: "pcc-original", text: "Original police clearance / character certificate" },
        { id: "pcc-apostille", text: "The PCC must be Apostilled" },
        {
          id: "pcc-visible",
          text: "All pages, stamps, signatures and Apostille details clearly visible",
        },
        { id: "pcc-colour", text: "Clear colour scan" },
      ],
    },
    {
      id: "full-passport",
      number: 2,
      title: "Full passport",
      items: [
        {
          id: "fp-complete",
          text: "The complete passport, including blank pages",
          detail: "Every page must be clear and readable.",
        },
        { id: "fp-signed", text: "Passport must be signed" },
        {
          id: "fp-history",
          text: "Previous visas, residence permits and entry / exit stamps clearly visible",
        },
        {
          id: "fp-old",
          text: "A complete scan of any old passport holding previous visas",
        },
      ],
    },
    {
      id: "insurance",
      number: 3,
      title: "Health insurance",
      items: [
        { id: "ins-valid", text: "Valid health / travel insurance according to visa requirements" },
        {
          id: "ins-guidance",
          text: "Wait for our guidance before you buy",
          detail:
            "We will tell you the coverage and validity your case requires, so you do not pay for a policy that is then refused.",
        },
      ],
    },
  ],
  rules: [
    "Scan documents in colour and high quality.",
    "Scan each document separately.",
    "Front and back must be provided where applicable.",
    "Apostille, stamps, signatures, QR codes and document numbers must be completely visible.",
    "Do not crop document edges or stamps.",
    "Blurred, incomplete or partially scanned documents will not be accepted for processing.",
  ],
};

export const VISA_CASE_NOTE =
  "Additional visa documents will be requested according to your individual case and the requirements applicable at the time of visa processing.";

/**
 * APPLYING WITH FAMILY.
 * ---------------------------------------------------------------------------
 * The source document says only that a family checklist is "provided
 * separately after individual consultation and case assessment", and that is
 * the whole of what it says. So this does not invent one.
 *
 * What it does instead is turn that sentence into something a person can act
 * on. The application already asks who is travelling — section 07 — so this
 * reads that answer, names them, says plainly that the single-applicant list
 * does not cover them, and gives them the one step that actually moves it:
 * asking for theirs.
 *
 * A requirement we have not been given is not a requirement we should guess
 * at. Family visa files turn on which country, which permit category, and
 * whose documents — inventing a list would be worse than the PDF this
 * replaces, because it would look authoritative.
 */
export type FamilyStatus = {
  /** True when the single-applicant list is not enough for this person. */
  travellingWithFamily: boolean;
  /** Whether they have answered the question at all. */
  answered: boolean;
  /** "your spouse", "your spouse and children" — as they told us. */
  who: string | null;
  headline: string;
  body: string;
};

export function familyStatus(dependants: string): FamilyStatus {
  const answer = (dependants || "").trim();

  const shared =
    "The single-applicant checklist does not cover them: what a family file needs " +
    "depends on which country, which permit category, and whose documents — so it " +
    "is set with you at a consultation rather than guessed at in advance.";

  if (!answer || /Undecided/i.test(answer)) {
    return {
      travellingWithFamily: false,
      answered: Boolean(answer),
      who: null,
      headline: "Are you bringing anyone with you?",
      body:
        "Everything here covers you alone. If a spouse or children are coming, tell us in " +
        "section 07 of your application — their documents are a separate list, and it is " +
        "much easier to start it early than to add people to a file already in motion.",
    };
  }

  if (/spouse and children/i.test(answer)) {
    return {
      travellingWithFamily: true,
      answered: true,
      who: "your spouse and children",
      headline: "You told us your spouse and children are coming with you",
      body: shared,
    };
  }

  if (/spouse/i.test(answer)) {
    return {
      travellingWithFamily: true,
      answered: true,
      who: "your spouse",
      headline: "You told us your spouse is coming with you",
      body: shared,
    };
  }

  return {
    travellingWithFamily: false,
    answered: true,
    who: null,
    headline: "You are travelling alone",
    body:
      "This checklist is exactly what your case needs. If that changes — a marriage, " +
      "a decision to bring children — tell your advisor, because it changes the visa " +
      "file and is far easier to handle before the application is submitted.",
  };
}

/* ══════════════════════════════════════════════ what applies to me ═══ */

const POSTGRADUATE = /Master|PhD|doctoral/i;
const FEBRUARY = /Spring \/ February/i;

/** The groups this applicant actually has to satisfy. */
export function groupsFor(checklist: Checklist, applyLevel: string): ChecklistGroup[] {
  const postgraduate = POSTGRADUATE.test(applyLevel || "");
  return checklist.groups.filter((g) => !g.onlyForLevel || postgraduate);
}

/**
 * THE FEBRUARY RULE, ADDRESSED TO ONE PERSON.
 *
 * The source states a rule and gives two examples, leaving the applicant to
 * work out which is theirs. We already know the level they chose, so it says
 * which of their documents needs the Apostille — the rule restated as an
 * instruction is the difference between a checklist and a leaflet.
 *
 * Returns null when they are not applying for February, because a requirement
 * that does not apply is noise on a list this long.
 */
export function februaryRequirement(
  intake: string,
  applyLevel: string
): { document: string; body: string } | null {
  if (!FEBRUARY.test(intake || "")) return null;

  const postgraduate = POSTGRADUATE.test(applyLevel || "");
  const document = postgraduate ? "your Bachelor's degree" : "your Intermediate / HSC";

  return {
    document,
    body:
      `For the February intake, your last completed qualification must be Apostilled / Legalized. ` +
      `For what you are applying for, that is normally ${document} — start it early, as it is the ` +
      `step that most often holds a February application up.`,
  };
}

/** Every tickable id that applies, for progress. */
export function itemIdsFor(checklist: Checklist, applyLevel: string): string[] {
  return groupsFor(checklist, applyLevel).flatMap((g) => g.items.map((i) => i.id));
}

export function checklistProgress(
  checklist: Checklist,
  applyLevel: string,
  ticked: Record<string, unknown>
): { done: number; total: number; percent: number } {
  const ids = itemIdsFor(checklist, applyLevel);
  const done = ids.filter((id) => ticked?.[id] === true).length;
  return {
    done,
    total: ids.length,
    percent: ids.length ? Math.round((done / ids.length) * 100) : 0,
  };
}

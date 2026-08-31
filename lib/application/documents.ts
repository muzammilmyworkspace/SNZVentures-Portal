/**
 * THE DOCUMENT FILE.
 * ---------------------------------------------------------------------------
 * Which documents a student is asked for depends on the level they chose in
 * section 01 — a Master's applicant needs a degree and a CV, a Bachelor's
 * applicant needs their SSC and HSSC. Asking everyone for everything trains
 * people to ignore the list.
 *
 * THE NAMING RULE IS NOT FUSSINESS. Universities process hundreds of files a
 * day and match them to applicants by filename. A file called scan_final(2).pdf
 * is a file that will be asked for again.
 */

export type DocumentSlot = {
  /** Goes into the filename. Uppercase, no spaces. */
  key: string;
  title: string;
  description: string;
  required: boolean;
  extension: "pdf" | "jpg";
};

/**
 * SURNAME_Given — the prefix every uploaded file must start with.
 *
 * Letters only. Punctuation, spaces and digits are stripped rather than
 * escaped: they are the characters that break a filename on the receiving end,
 * which is the whole thing this is for.
 */
export function filenamePrefix(familyName: string, givenName: string): string {
  const family =
    (familyName || "").toUpperCase().replace(/[^A-Z]/g, "") || "SURNAME";
  const givenRaw = (givenName || "").replace(/[^A-Za-z]/g, "") || "Name";
  const given = givenRaw.charAt(0).toUpperCase() + givenRaw.slice(1).toLowerCase();
  return `${family}_${given}`;
}

export function documentFilename(prefix: string, slot: DocumentSlot): string {
  return `${prefix}_${slot.key}.${slot.extension}`;
}

const ALWAYS: DocumentSlot[] = [
  {
    key: "CNIC",
    title: "CNIC — front and back",
    description:
      "Both sides in one PDF, front page first. National ID card if you are not Pakistani.",
    required: true,
    extension: "pdf",
  },
  {
    key: "PASSPORT",
    title: "Passport — 4 pages",
    description:
      "Bio-data page, the signature page, the back page with your address, and the last page. All four in one PDF, in that order.",
    required: true,
    extension: "pdf",
  },
  {
    key: "PHOTO",
    title: "Passport photograph",
    description:
      "White background, 35 × 45 mm. Already uploaded in section 02 if you did it there.",
    required: true,
    extension: "jpg",
  },
];

const TAIL: DocumentSlot[] = [
  {
    key: "ENGLISH",
    title: "English test result",
    description:
      "IELTS, PTE, TOEFL or Duolingo result card. Upload your MOI letter here instead if that is your route.",
    required: true,
    extension: "pdf",
  },
  {
    key: "MOTIVATION",
    title: "Motivation letter",
    description:
      "Leave this to us — we build it from section 06 and send it back for your signature. Upload one only if you already have a version you want us to use.",
    required: false,
    extension: "pdf",
  },
  {
    key: "BANK",
    title: "Bank statement / proof of funds",
    description:
      "Last six months, stamped by the bank. Sponsor's account if someone else is funding you.",
    required: false,
    extension: "pdf",
  },
  {
    key: "BIRTH",
    title: "Birth certificate (NADRA)",
    description:
      "Required for residence permits in most EU countries. Get it early — it takes weeks.",
    required: false,
    extension: "pdf",
  },
  {
    key: "EXPERIENCE",
    title: "Experience or reference letters",
    description:
      "On company letterhead, signed, with contact details. Merge into one PDF.",
    required: false,
    extension: "pdf",
  },
];

export function documentsFor(applyLevel: string | undefined): DocumentSlot[] {
  const postgraduate = /Master|PhD|doctoral/i.test(applyLevel || "");

  const middle: DocumentSlot[] = postgraduate
    ? [
        {
          key: "BACHELOR",
          title: "Bachelor's degree + full transcript",
          description:
            "Degree certificate and every semester or year transcript, merged into ONE PDF with the degree first.",
          required: true,
          extension: "pdf",
        },
        {
          key: "CV",
          title: "Curriculum vitae",
          description:
            "Two pages maximum, reverse chronological, with dates that match section 04. Required for all Master's applications.",
          required: true,
          extension: "pdf",
        },
        {
          key: "HSSC",
          title: "HSSC / Intermediate certificate + transcript",
          description:
            "Front and back of each, merged into one PDF. Some universities still ask for it.",
          required: false,
          extension: "pdf",
        },
      ]
    : [
        {
          key: "SSC",
          title: "SSC / Matric certificate + transcript",
          description:
            "Certificate and detailed marks sheet, front AND back of each page, merged into one PDF.",
          required: true,
          extension: "pdf",
        },
        {
          key: "HSSC",
          title: "HSSC / Intermediate certificate + transcript",
          description:
            "Certificate and detailed marks sheet, front AND back of each page, merged into one PDF. If you are still studying, upload your latest result card.",
          required: true,
          extension: "pdf",
        },
        {
          key: "CV",
          title: "Curriculum vitae",
          description: "One page is enough. Optional for Bachelor's, but it helps.",
          required: false,
          extension: "pdf",
        },
      ];

  return [...ALWAYS, ...middle, ...TAIL];
}

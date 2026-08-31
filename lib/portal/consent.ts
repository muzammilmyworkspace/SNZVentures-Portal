/**
 * STUDENT CONSENT & UNDERTAKING
 * ---------------------------------------------------------------------------
 * The wording below is SnZ Ventures' own document, reproduced as data. Nothing
 * here is invented: no promise, no success rate, no claim about outcomes has
 * been added, and the clauses say exactly what the signed paper form says.
 *
 * WHY IT IS VERSIONED
 * A consent is only worth anything if you can say WHAT was agreed to, not just
 * that something was. If these words are ever revised, `CONSENT_VERSION` moves
 * with them and old records keep pointing at the text those people actually
 * read. A consent table storing a bare `true` against wording that has since
 * changed proves nothing at all.
 *
 * WHY IT IS STUDENTS ONLY
 * The undertaking is about university admission and student visa processing.
 * Asking a job seeker or a business to agree to terms about a visa decision
 * that has nothing to do with them would be meaningless at best and misleading
 * at worst.
 */

export const CONSENT_VERSION = "2026-08-student-v1";

export const CONSENT_TITLE = "Student Consent & Undertaking";

export const CONSENT_PARTY = "SnZ Ventures MB, Vilnius, Lithuania";

/**
 * The clauses, in the order they appear on the form.
 *
 * `emphasis` marks the phrases the paper document sets in bold — the parts a
 * person most needs to have actually read. They are emphasised on screen for
 * the same reason they are bold on paper, not for decoration.
 */
export const CONSENT_CLAUSES: { text: string; emphasis: string[] }[] = [
  {
    text: "I confirm that I have voluntarily engaged SnZ Ventures MB for consultancy services related to university admission and student visa application processing.",
    emphasis: ["SnZ Ventures MB", "university admission and student visa application processing"],
  },
  {
    text: "I understand and agree that the consultancy service charges are independent of the visa decision. SnZ Ventures provides guidance, documentation support and application assistance only. The final visa decision is solely made by the Embassy / Immigration Authority.",
    emphasis: [
      "consultancy service charges are independent of the visa decision",
      "final visa decision is solely made by the Embassy / Immigration Authority",
    ],
  },
  {
    text: "I acknowledge that the consultancy fees paid for services are non-refundable once the admission and visa application process has commenced, regardless of whether the visa is approved or refused.",
    emphasis: [
      "consultancy fees paid for services are non-refundable once the admission and visa application process has commenced",
    ],
  },
  {
    text: "I also confirm that all documents and information provided by me are genuine and accurate. Any false or misleading information may affect the application outcome, for which SnZ Ventures will not be held responsible.",
    emphasis: [],
  },
];

export const CONSENT_CLOSING =
  "By ticking the box below I confirm that I have read, understood, and agreed to the above terms.";

/** What the checkbox itself says. Kept short enough to be read in full. */
export const CONSENT_CHECKBOX_LABEL =
  "I have read and agree to the Student Consent & Undertaking above.";

/**
 * Splits a clause into plain and emphasised runs so the component can render
 * the bold parts without `dangerouslySetInnerHTML`.
 *
 * The alternative was storing the clauses as HTML strings, which would put
 * markup into a file whose entire purpose is being the exact legal text — and
 * would mean injecting unescaped HTML to display an agreement. Not worth it to
 * make four phrases bold.
 */
export function consentRuns(clause: {
  text: string;
  emphasis: string[];
}): { text: string; strong: boolean }[] {
  if (!clause.emphasis.length) return [{ text: clause.text, strong: false }];

  const runs: { text: string; strong: boolean }[] = [];
  let rest = clause.text;

  for (const phrase of clause.emphasis) {
    const at = rest.indexOf(phrase);
    if (at === -1) continue;
    if (at > 0) runs.push({ text: rest.slice(0, at), strong: false });
    runs.push({ text: phrase, strong: true });
    rest = rest.slice(at + phrase.length);
  }

  if (rest) runs.push({ text: rest, strong: false });
  return runs;
}

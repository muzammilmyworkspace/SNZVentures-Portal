/**
 * THE MOTIVATION LETTER, ASSEMBLED RATHER THAN WRITTEN.
 * ---------------------------------------------------------------------------
 * Asked for a letter, most applicants produce something they found online, and
 * admissions officers recognise those immediately. Asked five specific
 * questions, the same person writes their own material — so the form asks the
 * questions and does the assembling.
 *
 * The result is explicitly a DRAFT. An advisor edits it onto letterhead before
 * anything is submitted, and the wording on screen says so: a student who
 * believes this is their finished letter has been misled by us.
 */

export function wordCount(text: string): number {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export const MOTIVATION_KEYS = ["mQ1", "mQ2", "mQ3", "mQ4", "mQ5"] as const;

export function buildMotivation(answers: Record<string, unknown>): string {
  const get = (k: string) => String(answers[k] ?? "").trim();
  const parts = MOTIVATION_KEYS.map(get);
  if (!parts.some(Boolean)) return "";

  const name = `${get("givenName")} ${get("familyName")}`.trim();
  const programme = get("prio1") || "the programme";

  const out: string[] = [
    "Dear Admissions Committee,",
    "",
    `I am writing to apply for ${programme}. ${parts[0]}`.trim(),
  ];
  for (const p of parts.slice(1)) if (p) out.push(p);
  out.push(
    "",
    "Thank you for considering my application. I would welcome the opportunity to discuss it further.",
    "",
    "Yours faithfully,",
    name || "[Your name]"
  );

  return out.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

/** The note under the word count. Length guidance, not a rule. */
export function lengthNote(words: number): { text: string; tone: "ok" | "low" } {
  if (words < 250) return { text: "most universities want 400–600", tone: "low" };
  if (words > 700) return { text: "consider trimming", tone: "low" };
  return { text: "good length", tone: "ok" };
}

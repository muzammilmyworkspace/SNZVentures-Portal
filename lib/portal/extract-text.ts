import "server-only";

/**
 * THE WORDS INSIDE AN UPLOADED CONSENT, so it becomes an editable draft.
 *
 * PDF through unpdf (pdf.js, no native parts, runs on Vercel), Word .docx
 * through mammoth. The old binary .doc format has no reliable reader, so it
 * is refused with a way out. Returns paragraphs separated by a blank line,
 * which is how the consent is shown and edited everywhere else.
 */

export const EXTRACTABLE = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function extractText(file: { type: string; name: string; buffer: Buffer }): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const { text } = await pdfText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    return tidy(pages.join("\n\n"));
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)
  ) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
    return tidy(value);
  }
  throw new Error("Upload a PDF or a Word .docx file. An old .doc file can be saved as .docx or PDF first.");
}

/**
 * Lines that a PDF broke mid-sentence are joined back up. A numbered or
 * bulleted line starts a new paragraph; a line that ends a sentence, or is
 * short like a heading, ends one.
 */
function tidy(raw: string): string {
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());
  const paras: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (!line) {
      if (cur) paras.push(cur);
      cur = "";
      continue;
    }
    if (cur && /^(\d+[.)]|\(?[a-z]\)|[-•●▪])\s/i.test(line)) {
      paras.push(cur);
      cur = "";
    }
    cur = cur ? `${cur} ${line}` : line;
    const ends = /[.:;!?)"”]$/.test(line) || line.length < 45;
    if (ends) {
      paras.push(cur);
      cur = "";
    }
  }
  if (cur) paras.push(cur);
  return paras.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 30000);
}

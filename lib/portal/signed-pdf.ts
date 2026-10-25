import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/*
 * THE SIGNED COPY of a consent or of the payment terms, as a PDF.
 *
 *   pages 1..n   the document exactly as the person was shown it: title, the
 *                party, the version and every clause (with its bold phrases)
 *   last page    the signature certificate: who (name, student ID, email),
 *                what they typed or ticked, when (Pakistan time and UTC),
 *                from which IP and browser, and a SHA-256 fingerprint of the
 *                words above, so any later change to them can be shown
 *
 * When the document in use is an uploaded PDF, that file is kept as it is and
 * the certificate is added after it; the fingerprint is then of the file.
 */

export type Run = { text: string; strong: boolean };
export type DocContent = {
  title: string;
  party: string;
  version: string;
  /** One entry per clause; each a list of runs (bold or not). */
  clauses: Run[][];
  closing?: string;
  /** An uploaded PDF used instead of the clauses. */
  originalPdf?: Uint8Array | null;
};

export type SignerInfo = {
  name: string;
  studentId: string;
  email: string;
  signedName: string;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  /** What they did: "Signed by typing their name" / "Accepted by ticking the box". */
  how: string;
};

const NAVY = rgb(0.043, 0.145, 0.271);
const SKY = rgb(0.008, 0.518, 0.78);
const MUTED = rgb(0.36, 0.42, 0.51);
const INK = rgb(0.1, 0.1, 0.12);
const A4: [number, number] = [595.28, 841.89];
const LEFT = 56;
const WIDTH = A4[0] - LEFT * 2;

/** The standard fonts carry Latin-1 only. */
const latin = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/↔/g, "<->")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const pk = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d) + " (Pakistan time)";

/** The text a fingerprint is taken of: title, party, version and clauses, as plain text. */
export function contentText(c: DocContent) {
  return [c.title, c.party, c.version, ...c.clauses.map((r) => r.map((x) => x.text).join("")), c.closing ?? ""].join("\n");
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private pdf: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private footer: string,
  ) {}
  newPage() {
    this.page = this.pdf.addPage(A4);
    this.page.drawRectangle({ x: 0, y: A4[1] - 34, width: A4[0], height: 34, color: NAVY });
    this.page.drawText("AdmitsFair", { x: LEFT, y: A4[1] - 22, size: 12, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText(latin(this.footer), { x: LEFT, y: 24, size: 7.5, font: this.font, color: MUTED });
    this.y = A4[1] - 70;
  }
  need(h: number) {
    if (this.y - h < 50) this.newPage();
  }
  /** Wraps runs of mixed weight; returns nothing, moves the cursor down. */
  runs(runs: Run[], size: number, opts: { indent?: number; lead?: string } = {}) {
    const indent = opts.indent ?? 0;
    const max = WIDTH - indent;
    // `glue`: the word continues the one before with no space (a bold phrase
    // followed by "." or ","), so no space is drawn between them.
    const words: { w: string; strong: boolean; glue: boolean }[] = [];
    for (const [ri, r] of runs.entries()) {
      const text = latin(r.text);
      text
        .split(/\s+/)
        .filter(Boolean)
        .forEach((w, wi) => words.push({ w, strong: r.strong, glue: ri > 0 && wi === 0 && !/^\s/.test(text) && !/\s$/.test(latin(runs[ri - 1].text)) }));
    }
    const lineH = size * 1.45;
    let line: { w: string; strong: boolean; glue: boolean }[] = [];
    let width = 0;
    const flush = (first: boolean) => {
      this.need(lineH);
      if (first && opts.lead) this.page.drawText(opts.lead, { x: LEFT, y: this.y, size, font: this.bold, color: NAVY });
      let x = LEFT + indent;
      for (const [i, t] of line.entries()) {
        const f = t.strong ? this.bold : this.font;
        const text = (i && !t.glue ? " " : "") + t.w;
        this.page.drawText(text, { x, y: this.y, size, font: f, color: INK });
        x += f.widthOfTextAtSize(text, size);
      }
      this.y -= lineH;
      line = [];
      width = 0;
    };
    let first = true;
    for (const word of words) {
      const f = word.strong ? this.bold : this.font;
      if (width + f.widthOfTextAtSize((line.length && !word.glue ? " " : "") + word.w, size) > max && line.length) {
        flush(first);
        first = false;
      }
      const lead = line.length && !word.glue ? " " : "";
      line.push(word);
      width += f.widthOfTextAtSize(lead + word.w, size);
    }
    if (line.length) flush(first);
  }
  text(s: string, size: number, o: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) {
    this.need(size * 1.5);
    this.page.drawText(latin(s), { x: LEFT, y: this.y, size, font: o.font ?? this.font, color: o.color ?? INK });
    this.y -= size * 1.5;
  }
  rule() {
    this.need(12);
    this.page.drawLine({ start: { x: LEFT, y: this.y }, end: { x: LEFT + WIDTH, y: this.y }, thickness: 1.5, color: SKY });
    this.y -= 18;
  }
}

/** The document (or the uploaded original) followed by the certificate. */
export async function buildSignedPdf(content: DocContent, signer: SignerInfo | null): Promise<{ pdf: Uint8Array; sha256: string }> {
  const fingerprintOf = content.originalPdf ? Buffer.from(content.originalPdf) : Buffer.from(contentText(content), "utf8");
  const sha256 = createHash("sha256").update(fingerprintOf).digest("hex");

  const pdf = content.originalPdf ? await PDFDocument.load(content.originalPdf, { ignoreEncryption: true }) : await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const footer = signer
    ? `${signer.how.startsWith("Accepted") ? "Accepted" : "Signed"} electronically by ${signer.name} (${signer.studentId}) on ${pk(signer.signedAt)}`
    : `${content.title} - version ${content.version} - AdmitsFair`;
  const w = new Writer(pdf, font, bold, footer);

  if (!content.originalPdf) {
    w.newPage();
    w.text(content.title, 20, { font: bold, color: NAVY });
    w.text(`Between ${content.party} and the student named on the certificate · version ${content.version}`, 9.5, { color: MUTED });
    w.rule();
    content.clauses.forEach((c, i) => {
      w.runs(c, 10.5, { indent: 22, lead: `${i + 1}.` });
      w.y -= 6;
    });
    if (content.closing) {
      w.y -= 4;
      w.runs([{ text: content.closing, strong: false }], 10.5);
    }
  } else if (signer) {
    for (const p of pdf.getPages()) p.drawText(latin(footer), { x: 36, y: 12, size: 7, font, color: MUTED });
  }

  if (signer) {
    w.newPage();
    w.text("Signature certificate", 20, { font: bold, color: NAVY });
    w.text(`${content.title} · version ${content.version}`, 10.5, { color: MUTED });
    w.rule();
    const rows: [string, string][] = [
      ["Name", signer.name],
      ["Student ID", signer.studentId],
      ["Email", signer.email],
      ["How", signer.how],
      ["Signed as", signer.signedName],
      ["Date and time", pk(signer.signedAt)],
      ["UTC", signer.signedAt.toISOString()],
      ["IP address", signer.ip ?? "Not recorded"],
      ["Browser / device", (signer.userAgent ?? "Not recorded").slice(0, 160)],
    ];
    for (const [k, v] of rows) {
      const before = w.y;
      w.page.drawText(latin(k), { x: LEFT, y: w.y, size: 10, font: bold, color: NAVY });
      const words = latin(v).split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, 10) > WIDTH - 130 && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      lines.forEach((l, i) => w.page.drawText(l, { x: LEFT + 130, y: before - i * 13, size: 10, font, color: INK }));
      w.y = before - 13 * Math.max(1, lines.length) - 8;
    }
    w.y -= 8;
    w.text("Document fingerprint (SHA-256)", 10, { font: bold, color: NAVY });
    w.text(sha256, 8.5, { color: MUTED });
    w.y -= 6;
    w.runs(
      [
        {
          text: `This certificate records that the person named above agreed to the document before it, electronically, while signed in to their own AdmitsFair student portal account, which is protected by their password. The fingerprint identifies the exact ${content.originalPdf ? "file" : "words"} they were shown: any change to ${content.originalPdf ? "the file" : "the text"} gives a different fingerprint. Issued by AdmitsFair (${content.party}).`,
          strong: false,
        },
      ],
      8.5,
    );
  }

  pdf.setTitle(signer ? `${content.title} (signed) - ${signer.name}` : content.title);
  pdf.setAuthor("AdmitsFair");
  pdf.setCreationDate(signer?.signedAt ?? new Date());
  return { pdf: await pdf.save(), sha256 };
}

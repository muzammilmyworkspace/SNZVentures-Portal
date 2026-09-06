/**
 * AN INVOICE IS A DOCUMENT SOMEBODY IS ASKED TO PAY FROM.
 *
 *   npm run verify:invoices
 *
 * Every function here fails quietly if it is wrong: a float total a cent away
 * from its own lines, a number issued twice, an amount read as a hundred
 * times what was typed, VAT rounded per line instead of once so the printed
 * figures disagree with each other. None of that shows up in a screenshot —
 * only in the number somebody eventually questions.
 */
import {
  parseAmount,
  toDecimal,
  formatMoney,
  parseVatPercent,
  vatOn,
  totalsFor,
  nextNumber,
  validateDraft,
  isCurrency,
} from "../lib/invoices/model.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/* ------------------------------------------------------------- amounts --- */

console.log("\n=== reading an amount ===");
{
  const good = [
    ["500", 50000], ["500.50", 50050], ["1,250.50", 125050], ["€500", 50000],
    [" 500.5 ", 50050], ["0.01", 1], ["0", 0], ["50,00", 5000], // decimal comma
    ["1,234,567.89", 123456789], ["Rs 500", 50000], ["Rs500.50", 50050],
  ];
  for (const [input, cents] of good) {
    const got = parseAmount(input);
    if (got !== cents) fail(`"${input}" read as ${got}, expected ${cents}`);
  }
  ok(`${good.length} written forms read correctly, PKR prefix included`);

  const bad = ["", "  ", "abc", "500.555", "5.5.5", "1,50,000", "50,5000", "€", "-500", "1e5"];
  for (const input of bad) {
    const got = parseAmount(input);
    if (got !== null) fail(`"${input}" was accepted as ${got}`);
  }
  ok(`${bad.length} unreadable, ambiguous or negative inputs refused rather than guessed`);

  for (const cents of [0, 1, 99, 100, 50050, 123456789]) {
    if (parseAmount(toDecimal(cents)) !== cents) fail(`${cents} did not survive a round trip`);
  }
  ok("every amount survives being written out and read back");

  if (formatMoney(123456, "EUR") !== "€1,234.56") fail(`formatted as ${formatMoney(123456, "EUR")}`);
  if (formatMoney(50000, "PKR") !== "Rs 500.00") fail(`PKR formatted as ${formatMoney(50000, "PKR")}`);
  if (formatMoney(0, "EUR") !== "€0.00") fail("zero did not format");
  ok("amounts read on the document the way a person expects");

  if (!isCurrency("EUR") || !isCurrency("PKR")) fail("a supported currency was rejected");
  if (isCurrency("XYZ") || isCurrency("")) fail("an unsupported currency code was accepted");
}

/* ------------------------------------------------------------------ VAT --- */

console.log("\n=== VAT ===");
{
  if (parseVatPercent("") !== 0) fail("a blank VAT field did not default to zero");
  if (parseVatPercent("21") !== 2100) fail("21% did not read as 2100 basis points");
  if (parseVatPercent("17.5") !== 1750) fail("17.5% did not read as 1750 basis points");
  if (parseVatPercent("21%") !== 2100) fail("a trailing % sign broke the read");
  for (const bad of ["-1", "101", "abc", "21.567"]) {
    if (parseVatPercent(bad) !== null) fail(`"${bad}" was accepted as a VAT percentage`);
  }
  ok("VAT percentages read correctly and out-of-range values are refused");

  /*
    ROUNDED ONCE, ON THE SUBTOTAL — NOT PER LINE.

    Two lines of €0.03 at 21% VAT: per-line rounding gives 1c + 1c = 2c. On the
    subtotal (6c) it is round(6 * 0.21) = 1c. Different answers, and an invoice
    whose printed VAT does not match "subtotal × rate" is one a customer's
    accountant will query.
  */
  const perLine = [3, 3].reduce((t, c) => t + Math.round((c * 2100) / 10_000), 0);
  const onSubtotal = vatOn(6, 2100);
  if (perLine === onSubtotal) fail("the test no longer demonstrates the difference it exists to show");
  ok(`VAT is computed once on the subtotal (this invoice: per-line would give ${perLine}c, we give ${onSubtotal}c)`);

  const t = totalsFor([{ desc: "a", amountCents: 20000 }, { desc: "b", amountCents: 30050 }], 2100);
  if (t.subtotalCents !== 50050) fail(`subtotal was ${t.subtotalCents}`);
  if (t.vatCents !== 10511) fail(`VAT at 21% of €500.50 was ${t.vatCents}, expected 10511`);
  if (t.totalCents !== t.subtotalCents + t.vatCents) fail("total does not equal subtotal + VAT");
  ok("totalsFor adds up exactly, and the invoice constraint (subtotal+vat=total) can never fail");
}

/* -------------------------------------------------------------- numbers --- */

console.log("\n=== invoice numbers ===");
{
  if (nextNumber(2026, []) !== "SNZ-2026-001") fail("the first number of a year is wrong");
  if (nextNumber(2026, ["SNZ-2026-001", "SNZ-2026-002"]) !== "SNZ-2026-003") {
    fail("the next number did not follow the highest existing one");
  }
  /* A gap must not be filled — SNZ-2026-002 was voided and skipped on purpose
     in some other scenario; reusing 004 after 001,002,005 exist is wrong. */
  if (nextNumber(2026, ["SNZ-2026-001", "SNZ-2026-005"]) !== "SNZ-2026-006") {
    fail("a gap in the sequence was filled instead of continuing past the highest number");
  }
  /* A DIFFERENT YEAR RESETS THE COUNT. Existing 2025 numbers must not push
     2026's sequence forward. */
  if (nextNumber(2026, ["SNZ-2025-099"]) !== "SNZ-2026-001") {
    fail("a prior year's numbers leaked into this year's sequence");
  }
  /* Numbers this parser cannot make sense of are ignored rather than crashing
     the whole calculation — a hand-edited or malformed row must not corrupt
     numbering for every invoice after it. */
  if (nextNumber(2026, ["not-a-number", "SNZ-2026-003", ""]) !== "SNZ-2026-004") {
    fail("a malformed existing number broke the calculation");
  }
  ok("numbers follow the highest issued this year, never fill a gap, and reset each year");
}

/* --------------------------------------------------------- the draft form -- */

console.log("\n=== validating what somebody typed ===");
{
  const base = {
    billToName: "Haider Khwaja", billToEmail: "", billToAddress: "",
    currency: "EUR", vatPercent: "0", issuedOn: "2026-09-06", dueOn: "",
    notes: "", lines: [{ desc: "Consultancy fee", amount: "200.00" }],
  };

  const good = validateDraft(base);
  if (!good.ok) fail("a well-formed draft was refused: " + good.errors.join("; "));
  else if (good.value.totalCents !== 20000) fail(`total was ${good.value.totalCents}`);
  ok("a well-formed draft validates and totals correctly");

  /* EVERY PROBLEM AT ONCE. Returning only the first means somebody fixes the
     name, saves, and is then told about the amount — a second round trip for
     a mistake that was visible the first time. */
  const messy = validateDraft({
    ...base, billToName: "", currency: "XYZ",
    lines: [{ desc: "x", amount: "12.345" }],
  });
  if (messy.ok) fail("a draft with three separate problems was accepted");
  else if (messy.errors.length < 3) fail(`only ${messy.errors.length} of 3 problems were reported`);
  ok("multiple problems are reported together, not one at a time");

  const cases = [
    [{ ...base, billToName: "" }, "an empty name"],
    [{ ...base, billToEmail: "not-an-email" }, "a malformed email"],
    [{ ...base, currency: "XYZ" }, "an unsupported currency"],
    [{ ...base, vatPercent: "150" }, "VAT above 100%"],
    [{ ...base, issuedOn: "" }, "a missing invoice date"],
    [{ ...base, dueOn: "2026-01-01" }, "a due date before the invoice date"],
    [{ ...base, lines: [] }, "no lines at all"],
    [{ ...base, lines: [{ desc: "x", amount: "" }] }, "a line with no amount"],
    [{ ...base, lines: [{ desc: "x", amount: "-5" }] }, "a negative line"],
    [{ ...base, lines: [{ desc: "x", amount: "0" }] }, "a zero-amount line"],
    [{ ...base, lines: Array.from({ length: 45 }, () => ({ desc: "x", amount: "1" })) }, "too many lines"],
  ];
  for (const [draft, label] of cases) {
    const r = validateDraft(draft);
    if (r.ok) fail(`${label} was accepted`);
  }
  ok(`${cases.length} invalid drafts are all refused`);

  /* A blank row is not an error — it is what an unused "add another line"
     click leaves behind, and should simply be dropped. */
  const withBlank = validateDraft({
    ...base,
    lines: [{ desc: "Fee", amount: "200" }, { desc: "", amount: "" }],
  });
  if (!withBlank.ok) fail("a trailing blank line was treated as an error");
  else if (withBlank.value.lines.length !== 1) fail("the blank line was not dropped");
  ok("a blank trailing line is dropped silently rather than reported as an error");

  /* A line with no description gets a sensible default rather than printing
     as nothing on the document. */
  const noDesc = validateDraft({ ...base, lines: [{ desc: "", amount: "50" }] });
  if (!noDesc.ok || noDesc.value.lines[0].desc !== "Consultancy fee") {
    fail("an amount-only line did not get a default description");
  }
  ok("a line with an amount but no description gets a readable default");
}

console.log(failures === 0 ? "\n  Invoice model verified.\n" : `\n  ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);

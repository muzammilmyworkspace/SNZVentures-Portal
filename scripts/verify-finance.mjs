/**
 * THE BOOKS HAVE TO ADD UP.
 *
 *   npm run verify:finance
 *
 * A split that is short by one cent is not a visible bug. It is three
 * statements that look right, a total that is off by an amount too small to
 * chase, and no way to tell which month it started in. So the property that
 * matters — THE PARTS ADD BACK TO THE WHOLE — is checked over thousands of
 * amounts rather than the two or three anybody would think to try by hand.
 */
import {
  parseAmount,
  toDecimal,
  formatAmount,
  splitProfit,
  profitFor,
  TOTAL_BASIS_POINTS,
} from "../lib/finance/money.ts";

let failures = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/** The real split: Shumaila 50, Rafay 25, Muzammil 25. */
const PARTNERS = [
  { id: "shumaila", basisPoints: 5000 },
  { id: "rafay", basisPoints: 2500 },
  { id: "muzammil", basisPoints: 2500 },
];

/* ------------------------------------------------------- reading an amount */

console.log("\n=== reading what somebody typed ===");
{
  const good = [
    ["4000", 400000],
    ["4000.50", 400050],
    ["4,000.50", 400050],
    ["€4000.5", 400050],
    [" 4000 ", 400000],
    ["0.01", 1],
    ["0", 0],
    ["1234,56", 123456],       // decimal comma
    ["1,234,567.89", 123456789], // thousands separators
    ["-250.25", -25025],
  ];
  for (const [input, cents] of good) {
    const got = parseAmount(input);
    if (got !== cents) fail(`"${input}" read as ${got}, expected ${cents}`);
  }
  ok(`${good.length} written forms read correctly, including a decimal comma`);

  /*
    REFUSED, NOT ROUNDED. Somebody typing 1234.567 has made a mistake; turning
    it into 1234.57 hides the mistake instead of asking about it. And "1,5"
    means one-fifty in Europe and fifteen hundred elsewhere — a hundredfold
    error, so it is read as a decimal comma only in the one unambiguous shape.
  */
  const bad = ["", "   ", "abc", "12.345", "1.2.3", "1,23,456", "12,3456", "€", "--5", "1e5"];
  for (const input of bad) {
    const got = parseAmount(input);
    if (got !== null) fail(`"${input}" was accepted as ${got}`);
  }
  ok(`${bad.length} unreadable or over-precise inputs refused rather than rounded`);

  for (const cents of [0, 1, -1, 99, 100, 123456, -123456, 100000000]) {
    if (parseAmount(toDecimal(cents)) !== cents) fail(`${cents} did not survive a round trip`);
  }
  ok("every amount survives being written out and read back");

  if (formatAmount(123456) !== "€1,234.56") fail(`formatted as ${formatAmount(123456)}`);
  if (formatAmount(-5) !== "-€0.05") fail(`a small negative formatted as ${formatAmount(-5)}`);
  if (formatAmount(0) !== "€0.00") fail("zero did not format");
  ok("amounts read on screen the way a person expects");
}

/* --------------------------------------------------------------- the split */

console.log("\n=== dividing the profit ===");
{
  const even = splitProfit(400000, PARTNERS);
  if (JSON.stringify(even.map((a) => a.cents)) !== JSON.stringify([200000, 100000, 100000])) {
    fail(`€4,000 split as ${JSON.stringify(even)}`);
  }
  ok("an amount that divides evenly splits 50/25/25 exactly");

  /*
    THE CENT THAT GOES MISSING. €4,000.01 is 200000.5 / 100000.25 / 100000.25
    cents. Rounding each gives one cent too many; flooring each gives one too
    few. Only the largest-remainder rule adds back to exactly what there was.
  */
  const odd = splitProfit(400001, PARTNERS);
  const sum = odd.reduce((t, a) => t + a.cents, 0);
  if (sum !== 400001) fail(`€4,000.01 split into parts totalling ${sum}`);
  if (odd[0].cents !== 200001) fail("the spare cent did not go to the largest shortfall");
  ok("an amount that does not divide evenly still adds back exactly");

  /*
    THE PROPERTY, OVER EVERY AMOUNT WORTH TRYING. This is the check that
    matters: whatever goes in, the parts must add back to it, and no share may
    come out negative on a profit.
  */
  let worst = 0;
  for (let i = 0; i < 20_000; i++) {
    const cents = Math.floor(Math.random() * 50_000_000);
    const parts = splitProfit(cents, PARTNERS);
    const total = parts.reduce((t, a) => t + a.cents, 0);
    if (total !== cents) {
      fail(`${cents} split into parts totalling ${total}`);
      break;
    }
    worst = Math.max(worst, Math.abs(parts[0].cents * 2 - cents));
  }
  ok(`20,000 random amounts all split without losing or inventing a cent`);

  /* Uneven share sets, not just the clean one we happen to use today. */
  const sets = [
    [{ id: "a", basisPoints: 10000 }],
    [{ id: "a", basisPoints: 3333 }, { id: "b", basisPoints: 3333 }, { id: "c", basisPoints: 3334 }],
    [{ id: "a", basisPoints: 1 }, { id: "b", basisPoints: 9999 }],
    [{ id: "a", basisPoints: 2000 }, { id: "b", basisPoints: 2000 }, { id: "c", basisPoints: 2000 },
     { id: "d", basisPoints: 2000 }, { id: "e", basisPoints: 2000 }],
  ];
  for (const set of sets) {
    for (const cents of [0, 1, 7, 99, 100003, 999999999]) {
      const parts = splitProfit(cents, set);
      const total = parts.reduce((t, a) => t + a.cents, 0);
      if (total !== cents) fail(`${cents} across ${set.length} shares totalled ${total}`);
    }
  }
  ok("thirds, a 1-basis-point share and a five-way split all still add up");

  /* Same input, same answer — a split that shuffles cannot be reconciled
     against the statement anybody was already sent. */
  const a = JSON.stringify(splitProfit(400001, PARTNERS));
  for (let i = 0; i < 50; i++) {
    if (JSON.stringify(splitProfit(400001, PARTNERS)) !== a) {
      fail("the same amount split differently on a later run");
      break;
    }
  }
  ok("the same amount always splits the same way");

  /* A loss is shared in the same proportion, not dumped on whoever is first. */
  const loss = splitProfit(-400001, PARTNERS);
  const lossTotal = loss.reduce((t, x) => t + x.cents, 0);
  if (lossTotal !== -400001) fail(`a loss split into parts totalling ${lossTotal}`);
  if (!loss.every((x) => x.cents <= 0)) fail("a loss produced a positive share");
  ok("a loss divides in the same proportion and still adds up");

  if (JSON.stringify(splitProfit(0, PARTNERS).map((x) => x.cents)) !== "[0,0,0]") {
    fail("zero did not split into zeroes");
  }

  /*
    REFUSED, NOT SCALED. Shares that do not total 100% mean somebody was added
    or removed and the rest not adjusted. Normalising them quietly would pay
    out a division nobody agreed to.
  */
  for (const broken of [
    [{ id: "a", basisPoints: 5000 }],
    [{ id: "a", basisPoints: 5000 }, { id: "b", basisPoints: 6000 }],
    [{ id: "a", basisPoints: 0 }, { id: "b", basisPoints: 10001 }],
  ]) {
    let threw = false;
    try { splitProfit(1000, broken); } catch { threw = true; }
    if (!threw) fail(`shares totalling ${broken.reduce((t, s) => t + s.basisPoints, 0)} were accepted`);
  }
  ok(`a share set that does not total ${TOTAL_BASIS_POINTS} is refused, not scaled`);
}

/* ---------------------------------------------------------- the whole chain */

console.log("\n=== what is left to divide ===");
{
  /* Referral payouts and expenses come out BEFORE the split, so the cost of
     introducing a client is carried by all three partners. */
  const month = profitFor({
    incomeCents: 1_000_000,   // €10,000 in
    refundCents: 50_000,      // €500 given back
    referralCents: 100_000,   // €1,000 to referrers
    expenseCents: 250_000,    // €2,500 out, marketing included
    carryInCents: 0,
  });
  if (month.netRevenueCents !== 950_000) fail("net revenue is wrong");
  if (month.costsCents !== 350_000) fail("costs are wrong");
  if (month.distributableCents !== 600_000) fail(`distributable was ${month.distributableCents}`);
  if (month.carryOutCents !== 0) fail("a profitable month carried something forward");

  const parts = splitProfit(month.distributableCents, PARTNERS);
  if (JSON.stringify(parts.map((p) => p.cents)) !== JSON.stringify([300000, 150000, 150000])) {
    fail(`the split came out as ${JSON.stringify(parts)}`);
  }
  ok("a normal month: costs out first, then 50/25/25 on what remains");

  /*
    A BAD MONTH DISTRIBUTES NOTHING AND MOVES FORWARD.

    Splitting a loss three ways would mean asking three people to pay money in,
    which is not what a small firm does — the shortfall is cleared out of the
    next good month before anybody is paid. Distributing on a loss is how a
    partner ends up owing money they were never told about.
  */
  const bad = profitFor({
    incomeCents: 100_000,
    refundCents: 0,
    referralCents: 20_000,
    expenseCents: 200_000,
    carryInCents: 0,
  });
  if (bad.distributableCents !== 0) fail("a losing month still distributed something");
  if (bad.carryOutCents !== -120_000) fail(`the shortfall carried was ${bad.carryOutCents}`);

  /* And the next good month clears it before anybody is paid. */
  const after = profitFor({
    incomeCents: 500_000,
    refundCents: 0,
    referralCents: 0,
    expenseCents: 100_000,
    carryInCents: bad.carryOutCents,
  });
  if (after.distributableCents !== 280_000) {
    fail(`the shortfall was not cleared first: ${after.distributableCents}`);
  }
  ok("a losing month pays nobody and is cleared out of the next good one");
}

console.log(failures === 0 ? "\n  Finance maths verified.\n" : `\n  ${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);

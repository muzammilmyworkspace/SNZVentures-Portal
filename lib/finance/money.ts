/**
 * MONEY, AND WHY NONE OF IT IS A FLOAT.
 * ---------------------------------------------------------------------------
 * Every amount in the finance module is an integer number of cents. Not a
 * number of euros, not a NUMERIC read into JavaScript, not a float — an
 * integer.
 *
 * The reason is the split. 0.1 + 0.2 is 0.30000000000000004, and a profit of
 * €4,000.10 divided 50/25/25 in floating point produces three shares that do
 * not add back to €4,000.10. Nobody notices for months, and then the books are
 * short by amounts too small to explain and too persistent to ignore — which
 * is worse than being wrong by a visible amount, because there is nothing to
 * point at.
 *
 * Integers cannot drift. What integers DO have is a remainder, and the whole
 * of `splitProfit` below is about placing that remainder somewhere defensible
 * rather than letting it evaporate.
 *
 * Nothing here touches the database or the network, so it is exercised
 * directly by `npm run verify:finance`.
 */

/** The books are kept in one currency. Chosen deliberately: see 017. */
export const CURRENCY = "EUR";

/** Shares are basis points — 5000 is 50%. Integers, so 50/25/25 is exact. */
export const TOTAL_BASIS_POINTS = 10_000;

/**
 * Reads a typed amount into cents.
 *
 * Accepts what a person actually types: "4000", "4,000.50", "€4 000,50",
 * " 4000.5 ". Refuses anything with more than two decimal places rather than
 * rounding it — somebody typing 1234.567 has made a mistake, and silently
 * turning it into 1234.57 hides the mistake instead of asking about it.
 *
 * Returns null for anything unreadable. Never throws: this parses form input,
 * and a thrown error in a form handler becomes a 500 for a typo.
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== "string") return null;

  let s = input.trim();
  if (!s) return null;

  const negative = /^-/.test(s);
  s = s.replace(/^-/, "");

  // Currency symbols, spaces and non-breaking spaces are noise from a paste.
  s = s.replace(/[€$£\s ]/g, "");

  /*
    COMMA IS AMBIGUOUS AND THE AMBIGUITY IS EXPENSIVE.

    "1,50" is one euro fifty in Europe and one hundred fifty in Pakistan, and
    reading it wrongly is a hundredfold error. The rule: a comma with exactly
    two digits after it AND no dot anywhere is a decimal comma; every other
    comma is a thousands separator.
  */
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    s = s.replace(/,/g, "");
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(",", ".");
  } else if (s.includes(",")) {
    return null; // Something we cannot read with confidence.
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;

  return negative ? -cents : cents;
}

/** Cents as a plain decimal string: 123456 → "1234.56". No symbol, no commas. */
export function toDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** For a screen: "€1,234.56". */
export function formatAmount(cents: number, currency = CURRENCY): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${sign}${symbol}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

export type Share = {
  /** Whoever the share belongs to. */
  id: string;
  /** Basis points. The set must add up to exactly 10,000. */
  basisPoints: number;
};

export type Allocation = { id: string; cents: number };

/**
 * Divides an amount between partners so the parts add back to the whole.
 *
 * THE PROBLEM: €4,000.01 split 50/25/25 is 200000.5, 100000.25 and 100000.25
 * cents. Rounding each to the nearest cent gives 200001 + 100000 + 100000 =
 * 400001 — one cent more than there was. Flooring each gives one cent less.
 * Either way the books do not balance, and by an amount nobody can explain.
 *
 * THE RULE — LARGEST REMAINDER. Everyone gets their floor. The cents left over
 * are handed out one each, to whoever was cut by the most. Ties go to the
 * earlier share in the list, so the same input always produces the same
 * answer: a split that shuffles between runs is one nobody can reconcile
 * against last month's statement.
 *
 * The parts are guaranteed to sum to `cents` exactly. That is the property
 * worth having, and it is the one `verify:finance` checks over thousands of
 * random amounts.
 *
 * A LOSS SPLITS THE SAME WAY. Negative amounts are divided by magnitude and
 * the sign put back, so a bad month is shared in the same proportion as a good
 * one rather than landing on whoever happens to be first in the list.
 */
export function splitProfit(cents: number, shares: readonly Share[]): Allocation[] {
  if (!shares.length) return [];

  const total = shares.reduce((sum, s) => sum + s.basisPoints, 0);
  if (total !== TOTAL_BASIS_POINTS) {
    // Refused rather than scaled. Shares that do not add to 100% mean somebody
    // has been added or removed and the rest not adjusted, and quietly
    // normalising it would distribute a number nobody agreed to.
    throw new Error(
      `Shares add up to ${total} basis points, not ${TOTAL_BASIS_POINTS}. Fix the split before closing.`
    );
  }
  if (!Number.isSafeInteger(cents)) {
    throw new Error("An amount must be a whole number of cents.");
  }

  const sign = cents < 0 ? -1 : 1;
  const magnitude = Math.abs(cents);

  const parts = shares.map((share, index) => {
    const exact = magnitude * share.basisPoints;
    return {
      id: share.id,
      index,
      floor: Math.floor(exact / TOTAL_BASIS_POINTS),
      remainder: exact % TOTAL_BASIS_POINTS,
    };
  });

  let leftover = magnitude - parts.reduce((sum, p) => sum + p.floor, 0);

  // Biggest shortfall first; the earlier share wins a tie, so the result is
  // the same every time it is computed.
  const order = [...parts].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index
  );
  for (const part of order) {
    if (leftover <= 0) break;
    part.floor += 1;
    leftover -= 1;
  }

  return parts.map((p) => ({ id: p.id, cents: sign * p.floor }));
}

export type ProfitInput = {
  /** Everything received in the period. */
  incomeCents: number;
  /** Money given back. */
  refundCents: number;
  /** Owed to whoever introduced the client. */
  referralCents: number;
  /** Everything else spent, marketing included. */
  expenseCents: number;
  /**
   * Carried in from the period before.
   *
   * A month that loses money distributes nothing — asking three people to pay
   * money IN is not what a small firm does. The shortfall moves forward
   * instead and the next good month clears it before anybody is paid, which is
   * what actually happens in practice and what the spreadsheet was doing by
   * hand.
   */
  carryInCents: number;
};

export type ProfitResult = {
  netRevenueCents: number;
  costsCents: number;
  /** What the partners divide. Never negative — a loss becomes carryOut. */
  distributableCents: number;
  /** Negative when the period lost money; becomes the next period's carryIn. */
  carryOutCents: number;
};

/**
 * The chain, in the order agreed: referral payouts and every expense come out
 * before anybody's share is worked out, so the cost of introducing a client is
 * carried by all three partners rather than by one.
 */
export function profitFor(input: ProfitInput): ProfitResult {
  const netRevenue = input.incomeCents - input.refundCents;
  const costs = input.referralCents + input.expenseCents;
  const result = netRevenue - costs + input.carryInCents;

  return {
    netRevenueCents: netRevenue,
    costsCents: costs,
    distributableCents: result > 0 ? result : 0,
    carryOutCents: result < 0 ? result : 0,
  };
}

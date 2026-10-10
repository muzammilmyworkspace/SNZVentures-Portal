/**
 * The Finance categories, in one place: the server checks against these and
 * the forms list them (this file has no server imports, so both can use it).
 */

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Software & subscriptions",
  "Marketing & ads",
  "Utilities & internet",
  "Travel",
  "Office & supplies",
  "Bank & payment fees",
  "Taxes",
  "Commission",
  "Refund (money returned)",
  "Other",
] as const;

export const INCOME_CATEGORIES = ["Student fees", "University commission", "Invoices", "Consultancy", "Refund received", "Other income"] as const;

export const FINANCE_CURRENCIES = ["EUR", "PKR", "USD", "GBP"] as const;

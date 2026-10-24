/*
 * Parts of the portal that can be switched off without deleting their code.
 *
 * CONSULTANTS (Oct 2026): AdmitsFair works with its own sales team now, not
 * outside consultants. With this off there is no "Become a consultant" at
 * sign-up, no consultant code, and the consultant pages and menu items are
 * gone. Set it back to true to bring the whole section back.
 *
 * FINANCE (Oct 2026): the books (finance dashboard, transactions, invoices)
 * are hidden for now. The pages, data and APIs stay; set it back to true to
 * show them again.
 *
 * STUDENT_ONLY (Oct 2026): the portal is for study-abroad students only. Sign
 * up skips the "what brings you here" step and always makes a student; the job
 * seeker and business pathways are not offered.
 */
export const CONSULTANTS_ENABLED = false;
export const FINANCE_ENABLED = false;
export const STUDENT_ONLY = true;

/** Pages (and everything under them) that belong to the consultant section. */
export const CONSULTANT_PAGES = [
  "/portal/admin/staff",
  "/portal/admin/consultant-applications",
  "/portal/admin/finance/consultants",
  "/portal/applicant",
];

/** Pages (and everything under them) that belong to the finance section. */
export const FINANCE_PAGES = ["/portal/admin/finance", "/portal/admin/invoices"];

/** The finance APIs, answered with a 404 while the section is hidden. */
export const FINANCE_APIS = ["/api/admin/finance", "/api/admin/invoices"];

const under = (list: string[], href: string) =>
  list.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));

export const isConsultantPage = (href: string) => under(CONSULTANT_PAGES, href);
export const isFinancePage = (href: string) => under(FINANCE_PAGES, href);
export const isFinanceApi = (href: string) => under(FINANCE_APIS, href);

/** A page that is switched off right now. */
export const isHiddenPage = (href: string) =>
  (!CONSULTANTS_ENABLED && isConsultantPage(href)) || (!FINANCE_ENABLED && isFinancePage(href));

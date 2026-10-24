/*
 * Parts of the portal that can be switched off without deleting their code.
 *
 * CONSULTANTS (Oct 2026): AdmitsFair works with its own sales team now, not
 * outside consultants. With this off there is no "Become a consultant" at
 * sign-up, no consultant code, and the consultant pages and menu items are
 * gone. Set it back to true to bring the whole section back.
 */
export const CONSULTANTS_ENABLED = false;

/** Pages (and everything under them) that belong to the consultant section. */
export const CONSULTANT_PAGES = [
  "/portal/admin/staff",
  "/portal/admin/consultant-applications",
  "/portal/admin/finance/consultants",
  "/portal/applicant",
];

export const isConsultantPage = (href: string) =>
  CONSULTANT_PAGES.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));

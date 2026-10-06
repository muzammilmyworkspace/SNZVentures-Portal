/**
 * WHAT AN EMPLOYEE MAY OPEN — the areas, and which pages belong to each.
 *
 * Plain module (no server imports): the sidebar uses it in the browser, the
 * guards on the server. `null` permissions mean no restriction (every admin
 * before 030, and any admin given full access); a super admin is never
 * restricted.
 */
export const AREAS = [
  { key: "enquiries", label: "Website enquiries", hint: "Contact-form enquiries and WhatsApp counts" },
  { key: "fees", label: "Fee verification", hint: "Check bank slips, verify or return fees" },
  { key: "applications", label: "Applications", hint: "Review, ready to apply, applied, completed, and documents" },
  { key: "users", label: "Users", hint: "Everyone on the portal, messages to many, student files" },
  { key: "consultants", label: "Consultants", hint: "The consultant list and their workload" },
  { key: "employees", label: "Employees", hint: "The staff list" },
  {
    key: "students",
    label: "Students",
    hint: "Fee-verified students: their files, documents and applications. Not who brought them",
  },
] as const;

/**
 * THE "ADMIN" ROLE: an employee who works students' files from the verified
 * fee to the submitted application, and sees nothing else. Not the consultant
 * who brought a student, not where they came from, not the rest of the firm.
 */
export const STUDENT_DESK: string[] = ["students"];

/** Is this an employee limited to the student desk? */
export function isStudentDesk(role: string, permissions: string[] | null | undefined): boolean {
  return (
    role === "admin" &&
    permissions != null &&
    permissions.includes("students") &&
    !permissions.includes("users") &&
    !permissions.includes("consultants")
  );
}

/**
 * "system" (audit log, database, integrations) is never offered as a tick
 * box: only admins with full access and super admins reach it.
 */
export type Area = (typeof AREAS)[number]["key"] | "system";
export const AREA_KEYS = AREAS.map((a) => a.key) as Area[];

/** The area a staff page belongs to, or null for pages every admin may open. */
export function areaForPath(path: string): Area | null {
  if (path.startsWith("/portal/admin/enquiries")) return "enquiries";
  if (path.startsWith("/portal/admin/students")) return "students";
  if (path.startsWith("/portal/admin/fees")) return "fees";
  if (/^\/portal\/admin\/(requests|ready|applied|completed)(\/|$)/.test(path)) return "applications";
  if (path.startsWith("/portal/admin/users")) return "users";
  if (path.startsWith("/portal/admin/staff")) return "consultants";
  if (path.startsWith("/portal/admin/employees")) return "employees";
  if (/^\/portal\/admin\/(audit|schema|integrations|forms)(\/|$)/.test(path)) return "system";
  return null;
}

/** May someone with these permissions use this area? */
export function canUse(role: string, permissions: string[] | null | undefined, area: Area | null): boolean {
  if (!area || role === "super_admin" || role === "advisor") return true;
  if (permissions == null) return true;
  return permissions.includes(area);
}

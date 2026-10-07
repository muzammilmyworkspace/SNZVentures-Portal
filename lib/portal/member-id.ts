/**
 * A person's short ID: STU-0012 (a student or other client), CON-0003 (a
 * consultant), EMP-0001 (an employee). The number is users.member_no (029),
 * given in the order people joined; the prefix follows the current role.
 */
export function memberId(role: string, memberNo: number | null): string {
  if (memberNo == null) return "—";
  const prefix = role === "advisor" || role === "applicant" ? "CON" : role === "admin" || role === "super_admin" ? "EMP" : "STU";
  return `${prefix}-${String(memberNo).padStart(4, "0")}`;
}

/** Which colour group a role belongs to (see [data-group] in boarding.css). */
export function groupOf(role: string): "student" | "consultant" | "employee" {
  return role === "advisor" || role === "applicant" ? "consultant" : role === "admin" || role === "super_admin" ? "employee" : "student";
}

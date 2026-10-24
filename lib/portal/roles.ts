import { isHiddenPage } from "./features";
import type { Role } from "@/lib/auth/types";

/**
 * ROLE ROUTING AND NAVIGATION — one source of truth.
 * ---------------------------------------------------------------------------
 * The portal has four audiences; each gets its own home, navigation and
 * language. Everything that varies by role is declared here, so the shell holds
 * no role logic and adding an audience is one entry rather than six edits.
 *
 * ROLE NAMES. The database stores `professional`; the interface says "Job
 * Seeker" and the URL says /portal/job-seeker. That stored value is a Postgres
 * enum seventeen tables and the RLS posture depend on, so it is mapped here
 * rather than renamed — a label is a presentation concern.
 *
 * THIS FILE AUTHORISES NOTHING. It decides where a role is SENT and what it is
 * SHOWN. Whether a request is allowed is decided by lib/auth/guard.ts, on the
 * server, against the database.
 */

export type PortalRole = "student" | "job-seeker" | "business" | "admin" | "applicant" | "sales";

/** Session role (database value) to URL segment. */
export function portalRoleFor(role: Role): PortalRole {
  switch (role) {
    case "student":
      return "student";
    case "professional":
      return "job-seeker";
    case "business":
      return "business";
    // Never falls through to the staff side: an applicant is not staff yet.
    case "applicant":
      return "applicant";
    // A sales agent sees their own students only, never the staff side.
    case "sales":
      return "sales";
    default:
      // advisor, admin and super_admin all work the operational side.
      return "admin";
  }
}

/** Where a signed-in user lands. */
export const homeFor = (role: Role) => `/portal/${portalRoleFor(role)}`;

export type BadgeKey =
  | "documents" | "messages" | "notifications" | "tasks" | "requests"
  | "enquiries" | "fees" | "review" | "ready" | "partners";

export type IconKey =
  | "dashboard" | "journey" | "applications" | "universities" | "documents"
  | "scholarships" | "messages" | "consultations" | "profile" | "settings"
  | "jobs" | "interviews" | "requests" | "services" | "users" | "activity"
  | "tasks";

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  badgeKey?: BadgeKey;
  /** Position in the student pipeline, drawn in place of the icon. */
  step?: number;
  /**
   * Restrict to specific underlying roles. advisor, admin and super_admin all
   * resolve to the "admin" nav, but a few destinations guard tighter than the
   * nav does — and a menu item that bounces you to a redirect is worse than
   * one that is not there.
   */
  roles?: Role[];
};

/**
 * Navigation per audience.
 *
 * Every destination is a route that exists and reads real data. Sections with
 * nothing behind them were left out rather than shipped as decoration — a menu
 * item that opens an invented page is worse than one that is absent.
 */
/** A group of the menu. `pipeline` draws it as a connected stepper (PortalShell). */
export type NavGroup = { group: string; items: NavItem[]; style?: "pipeline" };

export const navFor: Record<PortalRole, NavGroup[]> = {
  // Waiting to be approved as a consultant: their application, and nothing else.
  applicant: [
    { group: "Application", items: [{ href: "/portal/applicant", label: "My application", icon: "applications" }] },
    { group: "Account", items: [{ href: "/portal/settings", label: "Settings", icon: "settings" }] },
  ],
  // A sales agent: the students they brought, and nothing else.
  sales: [
    { group: "Sales", items: [{ href: "/portal/sales", label: "My students", icon: "users" }] },
    { group: "Account", items: [{ href: "/portal/settings", label: "Settings", icon: "settings" }] },
  ],
  student: [
    {
      group: "Journey",
      items: [
        { href: "/portal/student", label: "Dashboard", icon: "dashboard" },
        { href: "/portal/journey", label: "My Journey", icon: "journey" },
        { href: "/portal/application", label: "My Application", icon: "applications" },
        { href: "/portal/checklist", label: "Document checklist", icon: "documents" },
        /*
          BACK, FOR A REASON THAT DID NOT EXIST BEFORE.

          This was removed when documents moved into the application: a second
          page listing the same files without the checklist's context was just
          another place to get it wrong. That reasoning covered UPLOADING.

          It does not cover a document we have sent back. The application locks
          on submission, so when staff return a passport scan there has to be
          somewhere the student can still replace that one file — and the badge
          means the item only draws attention when something is actually
          waiting on them.
        */
        { href: "/portal/documents", label: "Documents", icon: "documents", badgeKey: "documents" },
        { href: "/portal/cases", label: "Applications", icon: "applications" },
      ],
    },

    {
      /*
        Explore, Consultations, Documents and Tasks all used to be here.

        Documents are collected inside the application now — section 08, where
        each slot explains itself and names the file — and a second page
        listing the same files without that context is just another place to
        get it wrong. The form is the task list.

        What is left is the route a student actually travels. A menu of eleven
        items where four are live teaches people to stop reading the menu.
      */
      group: "Contact",
      items: [
        { href: "/portal/messages", label: "Messages", icon: "messages", badgeKey: "messages" },
        { href: "/portal/notifications", label: "Notifications", icon: "activity", badgeKey: "notifications" },
      ],
    },
    {
      group: "Account",
      items: [
        { href: "/portal/profile", label: "Profile", icon: "profile" },
        { href: "/portal/settings", label: "Settings", icon: "settings" },
      ],
    },
  ],

  "job-seeker": [
    {
      group: "Career",
      items: [
        { href: "/portal/job-seeker", label: "Dashboard", icon: "dashboard" },
        { href: "/portal/journey", label: "My Journey", icon: "journey" },
        { href: "/portal/application", label: "Career Profile", icon: "profile" },
        { href: "/portal/cases", label: "Applications", icon: "applications" },
      ],
    },
    {
      group: "Opportunities",
      items: [
        { href: "/portal/jobs", label: "Jobs", icon: "jobs" },
        { href: "/portal/appointments", label: "Interviews", icon: "interviews" },
      ],
    },
    {
      group: "Your file",
      items: [
        { href: "/portal/documents", label: "CV & Documents", icon: "documents", badgeKey: "documents" },
        { href: "/portal/tasks", label: "Tasks", icon: "tasks", badgeKey: "tasks" },
        { href: "/portal/profile", label: "Profile", icon: "profile" },
      ],
    },
    {
      group: "Contact",
      items: [
        { href: "/portal/messages", label: "Messages", icon: "messages", badgeKey: "messages" },
        { href: "/portal/notifications", label: "Notifications", icon: "activity", badgeKey: "notifications" },
      ],
    },
    { group: "Account", items: [{ href: "/portal/settings", label: "Settings", icon: "settings" }] },
  ],

  business: [
    {
      group: "Business",
      items: [
        { href: "/portal/business", label: "Dashboard", icon: "dashboard" },
        { href: "/portal/cases", label: "My Requests", icon: "requests", badgeKey: "requests" },
        { href: "/portal/application", label: "Company Profile", icon: "profile" },
        { href: "/portal/services", label: "Services", icon: "services" },
      ],
    },
    {
      group: "Your file",
      items: [
        { href: "/portal/documents", label: "Documents", icon: "documents", badgeKey: "documents" },
        { href: "/portal/tasks", label: "Tasks", icon: "tasks", badgeKey: "tasks" },
      ],
    },
    {
      group: "Contact",
      items: [
        { href: "/portal/messages", label: "Messages", icon: "messages", badgeKey: "messages" },
        { href: "/portal/appointments", label: "Consultations", icon: "consultations" },
        { href: "/portal/notifications", label: "Notifications", icon: "activity", badgeKey: "notifications" },
      ],
    },
    { group: "Account", items: [{ href: "/portal/settings", label: "Settings", icon: "settings" }] },
  ],

  /*
    THE STAFF MENU (Oct 2026), tightened from eleven sections to six:

      Overview         the dashboard
      Student pipeline the six queues, in the order a student moves through
                       them, drawn as a stepper (see PortalShell)
      People           students, everyone, the firm's employees
      Inbox            messages, consultations, notifications
      Setup            the forms students fill (one page, two tabs) and the fee
      System           records and the tools only the super admin needs

    Pipeline queues are firm-wide, so admin only; each page guards itself too.
    Consultant-only items stay (roles: advisor) for when that section returns.
  */
  admin: [
    {
      group: "Overview",
      items: [{ href: "/portal/admin", label: "Dashboard", icon: "dashboard" }],
    },
    {
      group: "Student pipeline",
      style: "pipeline",
      items: [
        { href: "/portal/admin/enquiries", label: "Enquiries", icon: "messages", step: 1, badgeKey: "enquiries", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/fees", label: "Fee verification", icon: "requests", step: 2, badgeKey: "fees", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/requests", label: "Review applications", icon: "requests", step: 3, badgeKey: "review", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/ready", label: "Ready to apply", icon: "applications", step: 4, badgeKey: "ready", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/applied", label: "Applied", icon: "universities", step: 5, roles: ["admin", "super_admin"] },
        { href: "/portal/admin/completed", label: "Completed", icon: "activity", step: 6, roles: ["admin", "super_admin"] },
      ],
    },
    {
      group: "People",
      items: [
        // The student desk: fee-verified students.
        { href: "/portal/admin/students", label: "Students", icon: "users", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/users", label: "All users", icon: "users", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/employees", label: "Employees", icon: "profile", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/staff", label: "Consultants", icon: "profile", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/consultant-applications", label: "Consultant requests", icon: "requests", roles: ["super_admin"], badgeKey: "partners" },
        // A consultant's own book (consultants only).
        { href: "/portal/admin/my-students", label: "Your students", icon: "users", roles: ["advisor"] },
        { href: "/portal/admin/cases", label: "Cases", icon: "applications", roles: ["advisor"] },
      ],
    },
    {
      group: "Inbox",
      items: [
        { href: "/portal/messages", label: "Messages", icon: "messages", badgeKey: "messages" },
        { href: "/portal/appointments", label: "Consultations", icon: "consultations" },
        { href: "/portal/notifications", label: "Notifications", icon: "activity", badgeKey: "notifications" },
      ],
    },
    {
      group: "Setup",
      items: [
        // Application form and consent form: one page with two tabs (forms/layout.tsx).
        { href: "/portal/admin/forms", label: "Forms", icon: "documents", roles: ["super_admin", "advisor"] },
        // The initial process fee: plan amounts and the bank details on the voucher (047).
        { href: "/portal/admin/payment-settings", label: "Fees & voucher", icon: "requests", roles: ["super_admin"] },
        { href: "/portal/admin/integrations", label: "Integrations", icon: "settings", roles: ["admin", "super_admin"] },
      ],
    },
    {
      group: "Finance",
      items: [
        { href: "/portal/admin/finance", label: "Dashboard", icon: "activity", roles: ["super_admin"] },
        { href: "/portal/admin/finance/transactions", label: "Transactions", icon: "requests", roles: ["super_admin"] },
        { href: "/portal/admin/finance/fixed", label: "Fixed expenses", icon: "tasks", roles: ["super_admin"] },
        { href: "/portal/admin/finance/balance", label: "Balance & accounts", icon: "dashboard", roles: ["super_admin"] },
        { href: "/portal/admin/finance/integrations", label: "Integrations", icon: "settings", roles: ["super_admin"] },
        { href: "/portal/admin/finance/consultants", label: "Referrals", icon: "users", roles: ["super_admin"] },
        { href: "/portal/admin/finance/universities", label: "University commissions", icon: "universities", roles: ["super_admin"] },
        { href: "/portal/admin/finance/stakeholders", label: "Stakeholders", icon: "profile", roles: ["super_admin"] },
        { href: "/portal/admin/finance/reports", label: "Reports", icon: "journey", roles: ["super_admin"] },
        { href: "/portal/admin/invoices", label: "Invoices", icon: "requests", roles: ["super_admin", "advisor"] },
      ],
    },
    {
      group: "System",
      items: [
        { href: "/portal/admin/audit", label: "Audit log", icon: "activity", roles: ["admin", "super_admin"] },
        { href: "/portal/admin/schema", label: "Database & storage", icon: "settings", roles: ["admin", "super_admin"] },
        // Deletes every student and consultant (super admin, typed confirmation).
        { href: "/portal/admin/reset-data", label: "Reset data", icon: "settings", roles: ["super_admin"] },
        { href: "/portal/settings", label: "Settings", icon: "settings" },
      ],
    },
  ],
};

/** What each audience's dashboard calls itself. */
// Sections switched off in lib/portal/features.ts lose their menu items, and a
// group left with nothing in it goes too.
for (const [key, groups] of Object.entries(navFor)) {
  for (const g of groups) g.items = g.items.filter((i) => !isHiddenPage(i.href));
  navFor[key as PortalRole] = groups.filter((g) => g.items.length > 0);
}

export const roleContext: Record<PortalRole, { eyebrow: string; lead: string }> = {
  student: {
    eyebrow: "Study journey",
    lead: "Here's what's happening with your study abroad journey.",
  },
  "job-seeker": {
    eyebrow: "Career journey",
    lead: "Here's where your international job search stands.",
  },
  business: {
    eyebrow: "Business services",
    lead: "Manage your AdmitsFair services and requests.",
  },
  admin: {
    eyebrow: "Operations",
    lead: "Here's what the platform needs from you today.",
  },
  sales: {
    eyebrow: "Sales team",
    lead: "The students you brought to AdmitsFair, and where each one stands.",
  },
  applicant: {
    eyebrow: "Consultant application",
    lead: "Your application to work with AdmitsFair as a consultant.",
  },
};

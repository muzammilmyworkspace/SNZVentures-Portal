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

export type PortalRole = "student" | "job-seeker" | "business" | "admin";

/** Session role (database value) to URL segment. */
export function portalRoleFor(role: Role): PortalRole {
  switch (role) {
    case "student":
      return "student";
    case "professional":
      return "job-seeker";
    case "business":
      return "business";
    default:
      // advisor, admin and super_admin all work the operational side.
      return "admin";
  }
}

/** Where a signed-in user lands. */
export const homeFor = (role: Role) => `/portal/${portalRoleFor(role)}`;

export type BadgeKey = "documents" | "messages" | "notifications" | "tasks" | "requests";

export type IconKey =
  | "dashboard" | "journey" | "applications" | "universities" | "documents"
  | "scholarships" | "messages" | "consultations" | "profile" | "settings"
  | "jobs" | "interviews" | "requests" | "services" | "users" | "activity"
  | "tasks";

export type NavItem = { href: string; label: string; icon: IconKey; badgeKey?: BadgeKey };

/**
 * Navigation per audience.
 *
 * Every destination is a route that exists and reads real data. Sections with
 * nothing behind them were left out rather than shipped as decoration — a menu
 * item that opens an invented page is worse than one that is absent.
 */
export const navFor: Record<PortalRole, { group: string; items: NavItem[] }[]> = {
  student: [
    {
      group: "Journey",
      items: [
        { href: "/portal/student", label: "Dashboard", icon: "dashboard" },
        { href: "/portal/journey", label: "My Journey", icon: "journey" },
        { href: "/portal/application", label: "My Application", icon: "applications" },
        { href: "/portal/cases", label: "Applications", icon: "applications" },
      ],
    },
    {
      group: "Explore",
      items: [
        { href: "/portal/universities", label: "Universities", icon: "universities" },
        { href: "/portal/scholarships", label: "Scholarships", icon: "scholarships" },
      ],
    },
    {
      group: "Your file",
      items: [
        { href: "/portal/documents", label: "Documents", icon: "documents", badgeKey: "documents" },
        { href: "/portal/tasks", label: "Tasks", icon: "tasks", badgeKey: "tasks" },
        { href: "/portal/profile", label: "Profile", icon: "profile" },
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

  admin: [
    {
      group: "Operations",
      items: [
        { href: "/portal/admin", label: "Dashboard", icon: "dashboard" },
        { href: "/portal/admin/enquiries", label: "Enquiries", icon: "messages" },
        { href: "/portal/admin/requests", label: "Requests", icon: "requests" },
        { href: "/portal/admin/cases", label: "Cases", icon: "applications" },
        { href: "/portal/admin/documents", label: "Documents", icon: "documents" },
        { href: "/portal/admin/analytics", label: "Analytics", icon: "activity" },
      ],
    },
    {
      group: "People",
      items: [
        { href: "/portal/admin/users", label: "Users", icon: "users" },
        { href: "/portal/admin/staff", label: "Advisors", icon: "profile" },
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
    {
      group: "Account",
      items: [
        { href: "/portal/admin/audit", label: "Audit log", icon: "activity" },
        { href: "/portal/settings", label: "Settings", icon: "settings" },
      ],
    },
  ],
};

/** What each audience's dashboard calls itself. */
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
    lead: "Manage your SnZ Ventures services and requests.",
  },
  admin: {
    eyebrow: "Operations",
    lead: "Here's what the platform needs from you today.",
  },
};

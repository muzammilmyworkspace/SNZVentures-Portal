/**
 * SNZ VENTURES PORTAL — DOMAIN TYPES
 * ---------------------------------------------------------------------------
 * The data model is deliberately wider than the current storage adapter so a
 * real database can be dropped in without reshaping the application.
 */

export type Role =
  | "student"
  | "professional"
  | "business"
  | "advisor"
  | "admin"
  | "super_admin";

/** Client-facing roles, i.e. everything that gets a journey dashboard. */
export const CLIENT_ROLES: Role[] = ["student", "professional", "business"];
export const STAFF_ROLES: Role[] = ["advisor", "admin", "super_admin"];
/** Full operational control. */
export const ADMIN_ROLES: Role[] = ["admin", "super_admin"];

/**
 * DISPLAY names. The STORED value for a job seeker stays `professional` — it is
 * a Postgres enum that 17 tables and the RLS-guarded schema depend on, so
 * renaming it would be a destructive migration to change a word on screen.
 * The label belongs in the presentation layer, which is here.
 */
export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  professional: "Job Seeker",
  business: "Business",
  advisor: "Advisor",
  admin: "Administrator",
  super_admin: "Super Administrator",
};

/** Maps the registration question to a role. */
export const PATHWAY_TO_ROLE = {
  study: "student",
  career: "professional",
  business: "business",
} as const satisfies Record<string, Role>;

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** scrypt hash — never the password. See lib/auth/password.ts */
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  /** Free-form profile, shape depends on role. Progressive completion. */
  profile: Record<string, string>;
};

/** What the app is allowed to see. Never leak passwordHash past the adapter. */
export type PublicUser = Omit<User, "passwordHash">;

export type Session = {
  userId: string;
  email: string;
  role: Role;
  name: string;
  /** epoch seconds */
  exp: number;
  /**
   * The value of `users.session_epoch` when this token was minted.
   *
   * Verification rejects the token if the column has moved on since, which is
   * how signing out and changing a password actually end sessions rather than
   * merely forgetting them locally. Optional because tokens issued before the
   * column existed carry no value; those read as 0 and match the default.
   */
  ep?: number;
};

/* ---------------------------------------------------------------- Journeys */

export type JourneyStage = {
  key: string;
  name: string;
  description: string;
};

/**
 * Journey definitions per role. These mirror the public site's process
 * sections so the portal reads as a continuation, not a separate product.
 */
export const JOURNEYS: Record<"student" | "professional" | "business", JourneyStage[]> = {
  student: [
    { key: "profile", name: "Profile", description: "Tell us who you are and what you've studied." },
    { key: "assessment", name: "Assessment", description: "We read your record honestly and tell you where you stand." },
    { key: "opportunities", name: "Opportunities", description: "Courses and markets that fit your field and budget." },
    { key: "application", name: "Application", description: "Preparing what each institution actually asks for." },
    { key: "documents", name: "Documents", description: "Transcripts, language evidence and identity records." },
    { key: "review", name: "Review", description: "A final check before anything is submitted." },
    { key: "next", name: "Next step", description: "Decision, offer handling and what follows." },
  ],
  professional: [
    { key: "profile", name: "Profile", description: "Your experience, qualifications and current status." },
    { key: "eligibility", name: "Eligibility", description: "Recognition, language level and permit category." },
    { key: "positioning", name: "Positioning", description: "CV and evidence rebuilt for European employers." },
    { key: "opportunities", name: "Opportunities", description: "Roles we are actually mandated on." },
    { key: "introduction", name: "Introduction", description: "Employer introductions and interview coordination." },
    { key: "relocation", name: "Relocation", description: "Permit process and arrival logistics." },
  ],
  business: [
    { key: "consultation", name: "Consultation", description: "What you intend to do, and where." },
    { key: "assessment", name: "Assessment", description: "Whether the structure you have in mind holds up." },
    { key: "market", name: "Market review", description: "Jurisdiction, licensing scope and requirements." },
    { key: "structuring", name: "Structuring", description: "Entity type, ownership, capital and governance." },
    { key: "documentation", name: "Documentation", description: "Filings, legalisation and evidence." },
    { key: "setup", name: "Setup", description: "Incorporation, registrations and banking introduction." },
    { key: "operating", name: "Operating", description: "Accounting, payroll and reporting from period one." },
  ],
};

/* -------------------------------------------------------------- Records */

export type CaseStatus =
  | "draft"
  | "under_review"
  | "documents_required"
  | "in_progress"
  | "submitted"
  | "awaiting_response"
  | "completed";

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  documents_required: "Documents required",
  in_progress: "In progress",
  submitted: "Submitted",
  awaiting_response: "Awaiting response",
  completed: "Completed",
};

export type DocumentStatus =
  | "required"
  | "uploaded"
  | "pending_review"
  | "approved"
  | "needs_update";

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  required: "Required",
  uploaded: "Uploaded",
  pending_review: "Pending review",
  approved: "Approved",
  needs_update: "Needs update",
};

export type CaseRecord = {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  country: string | null;
  status: CaseStatus;
  updatedAt: string;
  nextAction: string | null;
  advisor: string | null;
};

export type DocumentRecord = {
  id: string;
  userId: string;
  name: string;
  category: string;
  status: DocumentStatus;
  updatedAt: string;
  /** Never a public URL — resolved through an access-controlled route. */
  storageKey: string | null;
};

export type TaskRecord = {
  id: string;
  userId: string;
  title: string;
  detail: string;
  due: string | null;
  done: boolean;
  href?: string;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  fromStaff: boolean;
  body: string;
  sentAt: string;
};

export type ConversationRecord = {
  id: string;
  userId: string;
  subject: string;
  updatedAt: string;
  unread: number;
};

export type AppointmentRecord = {
  id: string;
  userId: string;
  type: string;
  startsAt: string;
  status: "requested" | "confirmed" | "completed" | "cancelled";
  advisor: string | null;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
};

export type OpportunityRecord = {
  id: string;
  title: string;
  organisation: string;
  country: string;
  location: string;
  type: string;
  industry: string;
  summary: string;
  requirements: string[];
};

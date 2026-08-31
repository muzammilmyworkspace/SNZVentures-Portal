/**
 * INTAKE FORM DEFINITIONS
 * ---------------------------------------------------------------------------
 * The student admission form (§8), the career profile (§12) and the business
 * intake (§14), defined once as data.
 *
 * WHY DATA RATHER THAN THREE HAND-BUILT FORMS
 *
 * The server validates against these definitions and the client renders from
 * the same ones. A field that is not in this file cannot be rendered, cannot be
 * saved, and cannot be required — so the form the user sees and the rules the
 * API enforces are physically incapable of drifting apart. Adding a question is
 * one entry here, not a component edit plus a validator edit that someone
 * forgets to keep in step.
 *
 * NOTHING HERE ASSERTS A FACT. These are questions the business asks a new
 * client. Where a question touches on outcomes — visa likelihood, employment,
 * funding — the wording stays neutral and promises nothing.
 */

/*
 * TYPES AND THE STUDENT FORM NOW LIVE IN lib/application.
 *
 * The student application outgrew being one definition among three: it needs
 * conditional questions, repeated blocks, derived text and document slots, and
 * carrying those types here — beside two forms that use none of them — made
 * this file the place you had to read to understand any of it.
 *
 * They are re-exported so every existing import keeps working. The career and
 * business intakes are unchanged and still defined below.
 */
export type {
  FieldType,
  ShowWhen,
  IntakeField,
  IntakeStep,
  IntakeDefinition,
} from "@/lib/application/types";
export {
  PATHWAY_FOR_ROLE,
  optionsFor,
  fieldVisible,
  DECORATIVE,
} from "@/lib/application/types";

import type { IntakeField, IntakeStep, IntakeDefinition } from "@/lib/application/types";
import { optionsFor, fieldVisible, DECORATIVE } from "@/lib/application/types";
import { STUDY_APPLICATION } from "@/lib/application/definition";
import { documentsFor } from "@/lib/application/documents";
import { dateProblem, resolveBound } from "@/lib/application/dates";


/* ------------------------------------------------------ shared fragments */

const CONTACT_FIELDS: IntakeField[] = [
  { key: "fullName", label: "Full name (as in your passport)", type: "text", required: true, max: 120 },
  { key: "dateOfBirth", label: "Date of birth", type: "date", required: true },
  { key: "nationality", label: "Nationality", type: "text", required: true, max: 60 },
  { key: "countryOfResidence", label: "Country of residence", type: "text", required: true, max: 60 },
  { key: "city", label: "City", type: "text", max: 60 },
  { key: "phone", label: "Phone / WhatsApp", type: "tel", required: true, max: 40 },
  {
    key: "altEmail",
    label: "Alternative email",
    type: "email",
    max: 120,
    hint: "Optional. Useful if your main address stops working mid-process.",
  },
];

const ENGLISH_TESTS = [
  "IELTS Academic",
  "IELTS General",
  "TOEFL iBT",
  "PTE Academic",
  "Duolingo English Test",
  "Cambridge C1/C2",
  "Medium of instruction was English",
  "Not taken yet",
];

const YES_NO = ["Yes", "No"];

const PROFICIENCY = ["Beginner (A1)", "Elementary (A2)", "Intermediate (B1)", "Upper intermediate (B2)", "Advanced (C1)", "Proficient (C2)", "Native"];

/**
 * The twelve documents named on the paper form, in its order.
 *
 * Kept in step with REQUIRED_DOCUMENTS in lib/portal/data.ts, which is what the
 * documents area checks against. Two lists is one more than ideal; they serve
 * different jobs — this one is "tick what you already have", that one is "here
 * is what your file still needs" — and merging them would make one of the two
 * screens wrong.
 */
/* ------------------------------------------------------------ CAREER (§12) */

const CAREER: IntakeDefinition = {
  pathway: "career",
  title: "Career profile",
  steps: [
    {
      key: "personal",
      title: "Personal information",
      blurb: "The basics, exactly as they appear on your passport.",
      fields: CONTACT_FIELDS,
    },
    {
      key: "summary",
      title: "Professional summary",
      blurb: "In your own words — this is what an employer reads first.",
      fields: [
        { key: "currentTitle", label: "Current job title", type: "text", required: true, max: 120 },
        {
          key: "summaryText",
          label: "Professional summary",
          type: "textarea",
          required: true,
          max: 1200,
          hint: "Three or four sentences. What you do, who for, and what you are known for.",
        },
        {
          key: "totalExperience",
          label: "Total years of experience",
          type: "select",
          required: true,
          options: ["Under 2", "2–5", "5–10", "10–15", "15+"],
        },
      ],
    },
    {
      key: "education",
      title: "Education",
      blurb: "Your highest qualification, plus anything directly relevant to the roles you want.",
      fields: [
        {
          key: "highestQualification",
          label: "Highest qualification",
          type: "select",
          required: true,
          options: [
            "Secondary school",
            "Vocational / trade certification",
            "Diploma",
            "Bachelor's degree",
            "Master's degree",
            "Doctorate",
          ],
        },
        { key: "qualificationField", label: "Field", type: "text", required: true, max: 100 },
        { key: "qualificationInstitution", label: "Institution", type: "text", max: 140 },
        { key: "qualificationYear", label: "Year completed", type: "number" },
        {
          key: "certifications",
          label: "Professional certifications or licences",
          type: "textarea",
          max: 600,
          hint: "Several European roles are regulated. Licences matter more here than they might at home.",
        },
      ],
    },
    {
      key: "experience",
      title: "Work experience",
      blurb: "Your last two or three roles is plenty. Your CV carries the rest.",
      fields: [
        { key: "employmentHistory", label: "Recent roles", type: "textarea", required: true, max: 2000, hint: "Employer, title, dates, and what you were responsible for." },
        { key: "currentEmployer", label: "Current employer", type: "text", max: 140 },
        { key: "noticePeriod", label: "Notice period", type: "select", options: ["Immediately available", "2 weeks", "1 month", "2 months", "3 months or more"] },
      ],
    },
    {
      key: "skills",
      title: "Skills & industry",
      blurb: "What you want to be hired for.",
      fields: [
        { key: "keySkills", label: "Key skills", type: "textarea", required: true, max: 800 },
        {
          key: "industry",
          label: "Industry",
          type: "select",
          required: true,
          options: [
            "Technology & software", "Engineering", "Healthcare & nursing", "Finance & fintech",
            "Logistics & transport", "Construction", "Hospitality", "Manufacturing",
            "Education", "Skilled trades", "Other",
          ],
        },
        { key: "targetRoles", label: "Roles you are targeting", type: "text", required: true, max: 200 },
      ],
    },
    {
      key: "preferences",
      title: "Location & expectations",
      blurb: "Where you want to work, and what the move needs to be worth.",
      fields: [
        {
          key: "preferredCountries",
          label: "Preferred countries",
          type: "multiselect",
          required: true,
          options: [
            "Lithuania", "Poland", "Germany", "Netherlands", "Ireland",
            "Latvia", "Estonia", "Czechia", "Sweden", "Denmark",
            "Belgium", "Austria", "Open to advice",
          ],
        },
        { key: "preferredCities", label: "Preferred cities", type: "text", max: 200 },
        {
          key: "salaryExpectation",
          label: "Salary expectation",
          type: "text",
          max: 80,
          hint: "Annual gross, any currency. A range is fine — it helps us rule out roles that would waste your time.",
        },
        {
          key: "relocationReadiness",
          label: "How soon could you relocate?",
          type: "select",
          required: true,
          options: ["Immediately", "1–3 months", "3–6 months", "6–12 months", "Exploring only"],
        },
      ],
    },
    {
      key: "authorisation",
      title: "Work authorisation & languages",
      blurb:
        "This determines which routes are actually open to you, so an accurate answer here saves the most time.",
      fields: [
        {
          key: "workAuthorisation",
          label: "Current EU work authorisation",
          type: "select",
          required: true,
          options: [
            "None — would need sponsorship",
            "EU/EEA citizen",
            "EU permanent residence",
            "Current EU work permit",
            "EU Blue Card holder",
            "Spouse/family permit",
            "Not sure",
          ],
        },
        {
          key: "priorRefusals",
          label: "Any previous visa refusals?",
          type: "select",
          options: ["No", "Yes — happy to discuss"],
          hint: "A past refusal does not end the conversation, but hiding one can.",
        },
        { key: "languages", label: "Languages and level", type: "text", required: true, max: 240 },
      ],
    },
    {
      key: "review",
      title: "Review & submit",
      blurb: "Add anything that does not fit the boxes above.",
      fields: [
        { key: "portfolioUrl", label: "LinkedIn or portfolio URL", type: "text", max: 300 },
        { key: "additionalInfo", label: "Anything else we should know?", type: "textarea", max: 1500 },
        {
          key: "declaration",
          label: "I confirm the information above is accurate to the best of my knowledge",
          type: "select",
          required: true,
          options: ["Yes, I confirm"],
          hint: "Employers act on what we send them, which is what you tell us here.",
        },
      ],
    },
  ],
};

/* ---------------------------------------------------------- BUSINESS (§14) */

const BUSINESS: IntakeDefinition = {
  pathway: "business",
  title: "Business intake",
  steps: [
    {
      key: "company",
      title: "Company information",
      blurb: "Your existing entity, if you have one. If you do not yet, say so — that is a normal starting point.",
      fields: [
        { key: "companyName", label: "Company name", type: "text", required: true, max: 160, hint: "Or the working name if it is not yet incorporated." },
        {
          key: "incorporationStatus",
          label: "Incorporation status",
          type: "select",
          required: true,
          options: [
            "Not yet incorporated anywhere",
            "Incorporated outside the EU",
            "Incorporated inside the EU",
            "Both EU and non-EU entities",
          ],
        },
        { key: "registrationNumber", label: "Registration number", type: "text", max: 80 },
        { key: "yearFounded", label: "Year founded", type: "number" },
        { key: "website", label: "Website", type: "text", max: 240 },
      ],
    },
    {
      key: "contact",
      title: "Contact person",
      blurb: "Who we deal with day to day.",
      fields: [
        { key: "contactName", label: "Full name", type: "text", required: true, max: 120 },
        { key: "contactRole", label: "Role in the company", type: "text", required: true, max: 100 },
        { key: "contactPhone", label: "Phone / WhatsApp", type: "tel", required: true, max: 40 },
        { key: "contactEmail", label: "Email", type: "email", max: 120 },
        {
          key: "isAuthorised",
          label: "Are you authorised to sign on behalf of the company?",
          type: "select",
          required: true,
          options: ["Yes", "No — someone else signs", "Not yet decided"],
        },
      ],
    },
    {
      key: "profile",
      title: "Business type & industry",
      blurb: "What the business actually does.",
      fields: [
        {
          key: "businessType",
          label: "Business type",
          type: "select",
          required: true,
          options: ["Private limited company", "Sole trader", "Partnership", "Branch of a foreign company", "Not decided yet"],
        },
        {
          key: "industry",
          label: "Industry",
          type: "select",
          required: true,
          options: [
            "Technology & software", "Fintech & payments", "E-commerce & retail",
            "Logistics & transport", "Manufacturing", "Professional services",
            "Construction & real estate", "Healthcare", "Hospitality", "Other",
          ],
        },
        { key: "activityDescription", label: "Describe your activity", type: "textarea", required: true, max: 1200 },
        {
          key: "headcount",
          label: "Current headcount",
          type: "select",
          options: ["Just me", "2–10", "11–50", "51–200", "200+"],
        },
      ],
    },
    {
      key: "markets",
      title: "Current & target markets",
      blurb: "Where you operate now, and where you want to be.",
      fields: [
        { key: "currentMarkets", label: "Countries you operate in today", type: "text", required: true, max: 240 },
        {
          key: "targetMarkets",
          label: "Target markets",
          type: "multiselect",
          required: true,
          options: [
            "Lithuania", "Poland", "Germany", "Netherlands", "Ireland",
            "Latvia", "Estonia", "Czechia", "Spain", "France",
            "EU-wide", "Open to advice",
          ],
        },
        {
          key: "marketRationale",
          label: "Why those markets?",
          type: "textarea",
          max: 800,
          hint: "Customers, suppliers, talent, regulation — the real reason is the useful one.",
        },
      ],
    },
    {
      key: "services",
      title: "Services required",
      blurb: "What you want from us. Choose everything that applies.",
      fields: [
        {
          key: "servicesRequired",
          label: "Services required",
          type: "multiselect",
          required: true,
          options: [
            "Company formation",
            "Market entry strategy",
            "International expansion",
            "Fintech / payments licensing",
            "Accounting & tax compliance",
            "Recruitment & hiring",
            "Investor or founder relocation",
            "Partnership introductions",
            "General consultation",
          ],
        },
        {
          key: "timeline",
          label: "Timeline",
          type: "select",
          required: true,
          options: ["Immediately", "Within 3 months", "3–6 months", "6–12 months", "Exploring only"],
        },
        {
          key: "budgetRange",
          label: "Indicative budget",
          type: "text",
          max: 80,
          hint: "Optional, but it lets us tell you early if the scope and the budget do not meet.",
        },
      ],
    },
    {
      key: "goals",
      title: "Expansion goals",
      blurb: "What success looks like, in your terms.",
      fields: [
        { key: "objectives", label: "What are you trying to achieve?", type: "textarea", required: true, max: 1500 },
        {
          key: "concerns",
          label: "What worries you most about this move?",
          type: "textarea",
          max: 1000,
          hint: "Naming the risk early is how it gets addressed rather than discovered.",
        },
      ],
    },
    {
      key: "documents",
      title: "Company documents",
      blurb: "Nothing to upload here — the Documents area handles files whenever you are ready.",
      fields: [
        {
          key: "documentsReady",
          label: "Which documents do you already have?",
          type: "multiselect",
          options: [
            "Certificate of incorporation",
            "Articles of association",
            "Shareholder register",
            "Passports of shareholders",
            "Proof of address",
            "Financial statements",
            "Business plan",
            "Source of funds evidence",
          ],
        },
        { key: "documentNotes", label: "Anything we should know about your documents?", type: "textarea", max: 800 },
      ],
    },
    {
      key: "review",
      title: "Review & submit",
      blurb: "Anything else before this reaches an advisor.",
      fields: [
        { key: "additionalInfo", label: "Additional information", type: "textarea", max: 1500 },
        {
          key: "declaration",
          label: "I confirm the information above is accurate to the best of my knowledge",
          type: "select",
          required: true,
          options: ["Yes, I confirm"],
          hint: "Regulated filings depend on it. Nothing here is legal, tax or financial advice.",
        },
      ],
    },
  ],
};

const DEFINITIONS = { study: STUDY_APPLICATION, career: CAREER, business: BUSINESS } as const;

export function intakeFor(pathway: keyof typeof DEFINITIONS): IntakeDefinition {
  return DEFINITIONS[pathway];
}

/* ------------------------------------------------------------- validation */

/**
 * Whitelist, coerce and (optionally) require. Runs on the SERVER for every
 * save and every submit.
 *
 * Keys the step does not define are dropped rather than rejected — a stale
 * browser tab posting an old field should not fail the whole save, but it must
 * not write that field either.
 *
 * A HIDDEN FIELD IS NOT AN UNANSWERED ONE. Conditional questions are skipped
 * entirely: not required, not stored, not counted. Otherwise someone who
 * answered "No" to the visa-refusal question would be held up by the follow-up
 * asking for the details of a refusal that never happened.
 */
export function validateStep(
  step: IntakeStep,
  answers: Record<string, unknown>,
  opts: { requireAll: boolean }
): { clean: Record<string, unknown>; missing: string[] } {
  const clean: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const field of step.fields) {
    if (DECORATIVE.has(field.type)) continue;
    if (!fieldVisible(field, answers)) continue;

    const raw = answers[field.key];

    /* ------------------------------------------------ repeated blocks */
    if (field.type === "repeater") {
      const rows = Array.isArray(raw) ? raw : [];
      const cleanRows: Record<string, unknown>[] = [];

      for (const row of rows.slice(0, field.maxItems ?? 20)) {
        if (!row || typeof row !== "object") continue;
        const source = row as Record<string, unknown>;
        const cleanRow: Record<string, unknown> = {};
        for (const sub of field.item ?? []) {
          const value = source[sub.key];
          if (value === undefined || value === null) continue;
          const text = String(value).trim().slice(0, sub.max ?? 500);
          if (sub.type === "date") {
            const bad = dateProblem(
              text,
              { min: resolveBound(sub.dateMin), max: resolveBound(sub.dateMax) },
              sub.label
            );
            if (bad) {
              if (opts.requireAll) missing.push(bad);
              continue;
            }
          }
          cleanRow[sub.key] = text;
        }
        /*
          A block where every box is empty is not a qualification, it is one
          somebody opened and walked away from. Dropping it keeps the count
          honest — otherwise "add another" alone would look like progress.
        */
        if (Object.values(cleanRow).some((v) => v !== "")) cleanRows.push(cleanRow);
      }

      if (raw !== undefined) clean[field.key] = cleanRows;

      if (opts.requireAll) {
        const min = field.minItems ?? (field.required ? 1 : 0);
        if (cleanRows.length < min) {
          missing.push(field.label);
        } else {
          for (const [i, row] of cleanRows.entries()) {
            for (const sub of field.item ?? []) {
              if (sub.required && !String(row[sub.key] ?? "").trim()) {
                missing.push(`${field.itemLabel ?? field.label} ${i + 1} — ${sub.label}`);
              }
            }
          }
        }
      }
      continue;
    }

    /* ------------------------------------------------- document slots */
    if (field.type === "documents") {
      const map =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const cleanMap: Record<string, string> = {};
      for (const [slot, name] of Object.entries(map).slice(0, 40)) {
        if (typeof name === "string" && name.trim()) {
          cleanMap[String(slot).slice(0, 40)] = name.trim().slice(0, 200);
        }
      }
      if (raw !== undefined) clean[field.key] = cleanMap;
      /*
        Which slots are required depends on the study level, which lives in a
        different step. A step validator cannot see it, so completeness of the
        document file is decided by documentsComplete() instead.
      */
      continue;
    }

    /* ----------------------------------------------------- many-choice */
    if (field.type === "multiselect") {
      const offered = optionsFor(field);
      const list = Array.isArray(raw) ? raw : [];
      const value = list
        .filter((v): v is string => typeof v === "string")
        .filter((v) => !offered.length || offered.includes(v))
        .slice(0, 30);
      if (opts.requireAll && field.required && value.length === 0) missing.push(field.label);
      if (raw !== undefined) clean[field.key] = value;
      continue;
    }

    /* ----------------------------------------------------------- a box */
    if (field.type === "checkbox") {
      const value = raw === true || raw === "true" || raw === "on";
      if (raw !== undefined) clean[field.key] = value;
      if (opts.requireAll && field.required && !value) missing.push(field.label);
      continue;
    }

    if (raw === undefined || raw === null) {
      if (opts.requireAll && field.required) missing.push(field.label);
      continue;
    }

    const text = String(raw).trim().slice(0, field.max ?? 500);

    /* One choice, whether it is drawn as a dropdown or as pills. */
    if (field.type === "select" || field.type === "radio") {
      const offered = optionsFor(field);
      if (text && offered.length && !offered.includes(text)) {
        // A value outside the offered set is dropped, not stored.
        if (opts.requireAll && field.required) missing.push(field.label);
        continue;
      }
    }

    if (!text) {
      if (opts.requireAll && field.required) missing.push(field.label);
      clean[field.key] = "";
      continue;
    }

    /*
      A date control reports an empty string for anything it could not parse,
      while still SHOWING what was typed. Left unchecked, the form said "this
      one is required" beside a box with a date visibly in it. Anything that
      does arrive is checked for real: shape, a day that exists, and the
      bounds the definition declares.
    */
    if (field.type === "date") {
      const bad = dateProblem(
        text,
        { min: resolveBound(field.dateMin), max: resolveBound(field.dateMax) },
        field.label
      );
      if (bad) {
        if (opts.requireAll) missing.push(bad);
        continue;
      }
    }

    if (field.mustMatch) {
      const other = String(answers[field.mustMatch] ?? "").trim();
      if (other && text.toLowerCase() !== other.toLowerCase()) {
        if (opts.requireAll) missing.push(field.label);
        continue;
      }
    }

    if (field.type === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) {
        if (opts.requireAll && field.required) missing.push(field.label);
        continue;
      }
      clean[field.key] = n;
      continue;
    }

    clean[field.key] = text;
  }

  return { clean, missing };
}

/**
 * Is the document file complete?
 *
 * Kept out of validateStep because the required slots depend on the study
 * level chosen in section 01, and a step validator only ever sees its own step.
 */
export function documentsComplete(data: Record<string, unknown>): boolean {
  const held = (data.documents ?? {}) as Record<string, unknown>;
  return documentsFor(String(data.applyLevel ?? ""))
    .filter((slot) => slot.required)
    .every((slot) => Boolean(held[slot.key]));
}

/** Percentage of required questions answered, across the whole definition. */
export function intakeCompletion(
  definition: IntakeDefinition,
  data: Record<string, unknown>
): { percent: number; answered: number; total: number } {
  const isAnswered = (field: IntakeField): boolean => {
    const v = data[field.key];
    if (field.type === "repeater") {
      const rows = Array.isArray(v) ? v : [];
      if (rows.length < (field.minItems ?? 1)) return false;
      return rows.every((row) =>
        (field.item ?? [])
          .filter((sub) => sub.required)
          .every((sub) => String((row as Record<string, unknown>)?.[sub.key] ?? "").trim() !== "")
      );
    }
    if (field.type === "documents") return documentsComplete(data);
    if (field.type === "checkbox") return v === true;
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  };

  /*
    Only what is actually being asked. A question hidden behind a condition the
    student did not meet is not an unanswered question, and counting it would
    park the progress bar below 100% for everyone who has nothing to declare.
  */
  const required = definition.steps
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !DECORATIVE.has(f.type) && fieldVisible(f, data));

  if (!required.length) return { percent: 100, answered: 0, total: 0 };

  const answered = required.filter(isAnswered).length;
  return {
    percent: Math.round((answered / required.length) * 100),
    answered,
    total: required.length,
  };
}

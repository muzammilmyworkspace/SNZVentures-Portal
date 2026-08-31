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

export type FieldType = "text" | "email" | "tel" | "date" | "number" | "select" | "multiselect" | "textarea";

export type IntakeField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  /** Shown under the field. Use it to explain WHY something is asked. */
  hint?: string;
  /** Characters. Applied on the server as a hard slice, not just a UI maxlength. */
  max?: number;
};

export type IntakeStep = {
  key: string;
  title: string;
  /** One sentence on what this step is for. Reduces the sense of a wall of fields. */
  blurb: string;
  fields: IntakeField[];
};

export type IntakeDefinition = {
  pathway: "study" | "career" | "business";
  title: string;
  steps: IntakeStep[];
};

/** Session role → the intake that role fills in. Derived server-side, never posted. */
export const PATHWAY_FOR_ROLE = {
  student: "study",
  professional: "career",
  business: "business",
} as const;

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
const STUDY_DOCUMENTS = [
  "Formal passport-size photo (white background)",
  "NIC — front & back in a single PDF",
  "Passport — first 4 pages, scanned",
  "Passport — full copy",
  "SSC / Matric result card & certificate (attested)",
  "HSC / FA result card & certificate (attested)",
  "Professional diploma (if any)",
  "Bachelor's degree certificate & transcript (attested)",
  "Master's degree certificate & transcript (attested)",
  "IELTS or other English proficiency certificate",
  "English proficiency letter (if applicable)",
  "Curriculum vitae (Master's applicants)",
  "Experience certificates (if mentioned in CV)",
];

/* ------------------------------------------------------------- STUDY (§8) */

/**
 * THE ADMISSION FORM, following SnZ Ventures' own paper document.
 *
 * Section order and wording follow the printed form so that a student who has
 * seen one recognises the other, and so staff reading a submission can put it
 * side by side with a file that arrived on paper.
 *
 * TWO SECTIONS ARE NOT ON THE PAPER FORM and are kept anyway: preferred
 * countries, and how the studies will be funded. The paper form is headed
 * "admission — Lithuania", but the portal advises on several destinations, and
 * funding is the question every immigration authority asks. Dropping questions
 * the business already collects would have been a silent downgrade dressed up
 * as matching a document.
 *
 * WHAT IS REQUIRED IS DELIBERATE. Only fields an application genuinely cannot
 * proceed without carry `required`. Marking optional things required is how a
 * long form starts collecting invented answers — a made-up Skype ID is worse
 * than a blank one, because nobody can tell it is made up.
 */
const STUDY: IntakeDefinition = {
  pathway: "study",
  title: "Student admission application",
  steps: [
    {
      key: "personal",
      title: "Personal information",
      blurb: "Exactly as printed in your passport. A mismatch here is the most common reason an application is returned.",
      fields: [
        { key: "givenName", label: "Given name", type: "text", required: true, max: 80 },
        { key: "familyName", label: "Family name", type: "text", required: true, max: 80 },
        { key: "gender", label: "Gender", type: "select", required: true, options: ["Male", "Female", "Other"] },
        { key: "citizenship", label: "Citizenship", type: "text", required: true, max: 60 },
        { key: "passportNumber", label: "Passport number", type: "text", required: true, max: 30 },
        { key: "passportIssueDate", label: "Passport issue date", type: "date", required: true },
        {
          key: "passportExpiryDate",
          label: "Passport expiry date",
          type: "date",
          required: true,
          hint: "Most institutions expect a passport valid well beyond your intended start date.",
        },
        { key: "passportIssuedBy", label: "Issued by", type: "text", required: true, max: 80 },
        { key: "dateOfBirth", label: "Date of birth", type: "date", required: true },
        { key: "countryOfBirth", label: "Country of birth", type: "text", required: true, max: 60 },
        { key: "placeOfBirth", label: "Place of birth", type: "text", required: true, max: 80 },
      ],
    },
    {
      key: "contact",
      title: "Contact information",
      blurb: "Where we and the institution can reach you. Use an address you will still have in a year.",
      fields: [
        { key: "contactEmail", label: "Email", type: "email", required: true, max: 120 },
        { key: "mobile", label: "Mobile number", type: "tel", required: true, max: 40 },
        { key: "skypeId", label: "Skype ID", type: "text", max: 80, hint: "Optional. Some institutions interview over Skype." },
        { key: "streetAddress", label: "Street address", type: "text", required: true, max: 160 },
        { key: "cityRegion", label: "City / province / region", type: "text", required: true, max: 100 },
        { key: "postalCode", label: "Postal code", type: "text", max: 20 },
        { key: "country", label: "Country", type: "text", required: true, max: 60 },
      ],
    },
    {
      key: "emergency",
      title: "Emergency contact",
      blurb: "Someone we or the institution can reach if we cannot reach you.",
      fields: [
        { key: "emergencyName", label: "Full name", type: "text", required: true, max: 120 },
        { key: "emergencyPhone", label: "Telephone number", type: "tel", required: true, max: 40 },
        { key: "emergencyRelation", label: "Relation to applicant", type: "text", required: true, max: 60 },
      ],
    },
    {
      key: "education",
      title: "Education background",
      blurb: "Your most recent or highest qualification. Approximate dates are fine if you are still studying.",
      fields: [
        {
          key: "highestQualification",
          label: "Highest level of education",
          type: "select",
          required: true,
          options: [
            "Secondary school (Matric / SSC / O-Level)",
            "Higher secondary (FA / FSc / HSC / A-Level)",
            "Diploma",
            "Bachelor's degree",
            "Master's degree",
            "Doctorate",
          ],
        },
        { key: "institution", label: "Institution name", type: "text", required: true, max: 140 },
        { key: "programName", label: "Program name", type: "text", required: true, max: 140 },
        { key: "awardedQualification", label: "Awarded qualification / degree", type: "text", required: true, max: 140 },
        { key: "diplomaTitle", label: "Diploma title", type: "text", max: 140 },
        { key: "studyStartDate", label: "Start date", type: "date", required: true },
        { key: "expectedGraduation", label: "Expected graduation date", type: "date", required: true },
        { key: "programLength", label: "Nominal program length", type: "text", max: 60, placeholder: "e.g. 4 years" },
        { key: "honours", label: "Honours / distinctions (if any)", type: "text", max: 200 },
        { key: "institutionCountry", label: "Country of institution", type: "text", required: true, max: 60 },
        { key: "languageOfInstruction", label: "Language of instruction", type: "text", required: true, max: 60 },
      ],
    },
    {
      key: "language",
      title: "Language proficiency",
      blurb: "Nearly every institution asks for evidence of English. If you have not tested yet, say so — it changes which options are realistic, not whether we can help.",
      fields: [
        { key: "nativeLanguage", label: "Native language", type: "text", required: true, max: 60 },
        { key: "englishTest", label: "English test taken", type: "select", required: true, options: ENGLISH_TESTS },
        { key: "englishScore", label: "Overall score", type: "text", max: 40 },
        { key: "englishDate", label: "Date taken", type: "date" },
        { key: "foreignLanguage1", label: "Other language", type: "text", max: 60 },
        { key: "foreignLanguage1Level", label: "Proficiency level", type: "select", options: PROFICIENCY },
        { key: "foreignLanguage1Years", label: "Years of study or use", type: "text", max: 30 },
        { key: "foreignLanguage2", label: "A further language (if any)", type: "text", max: 60 },
        { key: "foreignLanguage2Level", label: "Proficiency level", type: "select", options: PROFICIENCY },
        { key: "foreignLanguage2Years", label: "Years of study or use", type: "text", max: 30 },
      ],
    },
    {
      key: "employment",
      title: "Employment history",
      blurb: "Your most recent position. Leave blank if you have not worked yet — that is common and counts against nobody.",
      fields: [
        { key: "companyName", label: "Company name", type: "text", max: 140 },
        { key: "businessSector", label: "Business sector", type: "text", max: 100 },
        { key: "positionHeld", label: "Position held", type: "text", max: 100 },
        { key: "employmentStart", label: "Start date", type: "date" },
        { key: "employmentEnd", label: "End date", type: "date" },
        { key: "currentlyEmployed", label: "Currently employed?", type: "select", options: YES_NO },
      ],
    },
    {
      key: "activities",
      title: "Activities & residence history",
      blurb: "Institutions read this. Time abroad also matters to a visa officer, so it is worth stating plainly.",
      fields: [
        {
          key: "keyActivities",
          label: "Key activities (sports, hobbies, volunteer work)",
          type: "textarea",
          max: 800,
        },
        {
          key: "stayedAbroad",
          label: "Have you stayed abroad for extended periods?",
          type: "select",
          required: true,
          options: YES_NO,
        },
        {
          key: "abroadDetails",
          label: "If yes — purpose, country and duration",
          type: "textarea",
          max: 800,
        },
      ],
    },
    {
      key: "motivation",
      title: "Motivation letter",
      blurb: "Answer in your own words. These four answers become the basis of the motivation letter that goes with your application, so what you write here matters more than anything else on this form.",
      fields: [
        {
          key: "whyProgram",
          label: "Why have you chosen this program?",
          type: "textarea",
          required: true,
          max: 1500,
        },
        {
          key: "expectedGain",
          label: "What do you expect to gain from your studies?",
          type: "textarea",
          required: true,
          max: 1500,
        },
        {
          key: "suitability",
          label: "Why does your background make you a suitable candidate?",
          type: "textarea",
          required: true,
          max: 1500,
        },
        {
          key: "careerGoals",
          label: "How will this program help you achieve your goals?",
          type: "textarea",
          required: true,
          max: 1500,
        },
      ],
    },
    {
      key: "preferences",
      title: "Where and how you will study",
      blurb: "Not on the paper form, and asked because it changes what we can realistically propose.",
      fields: [
        {
          key: "countries",
          label: "Countries you would consider",
          type: "multiselect",
          required: true,
          options: [
            "Lithuania", "Latvia", "Estonia", "Poland", "Germany", "Netherlands",
            "Ireland", "United Kingdom", "Sweden", "Denmark", "Spain", "Italy",
            "France", "Open to advice",
          ],
        },
        {
          key: "fundingSource",
          label: "How will your studies be funded?",
          type: "select",
          required: true,
          options: [
            "Family support",
            "Personal savings",
            "Bank loan",
            "Employer sponsorship",
            "Scholarship (applied or hoping to)",
            "Combination of the above",
            "Not yet decided",
          ],
          hint: "Immigration authorities ask for evidence of this. An honest answer now avoids a refused application later.",
        },
        {
          key: "annualBudget",
          label: "Approximate budget per year, including living costs",
          type: "select",
          options: [
            "Under €6,000",
            "€6,000 – €10,000",
            "€10,000 – €15,000",
            "€15,000 – €25,000",
            "Over €25,000",
            "Not sure yet",
          ],
        },
      ],
    },
    {
      key: "other",
      title: "Anything else we should know",
      blurb: "All optional except the last question.",
      fields: [
        {
          key: "medicalInformation",
          label: "Any medical conditions to disclose?",
          type: "textarea",
          max: 800,
          hint: "Optional, and only shared where an institution or insurer genuinely requires it.",
        },
        { key: "additionalRequests", label: "Additional requests", type: "textarea", max: 800 },
        {
          key: "informationSource",
          label: "How did you learn about this study opportunity?",
          type: "text",
          required: true,
          max: 200,
        },
      ],
    },
    {
      key: "documents",
      title: "Documents",
      blurb: "Tick what you already have. Nothing here is uploaded on this screen — you upload files in Documents, and we will tell you if anything needs replacing.",
      fields: [
        {
          key: "documentsReady",
          label: "Documents you already hold",
          type: "multiselect",
          options: STUDY_DOCUMENTS,
        },
        {
          key: "documentNotes",
          label: "Anything we should know about your documents?",
          type: "textarea",
          max: 800,
          hint: "Attestation still pending, a name spelled differently, a certificate lost — tell us now rather than later.",
        },
      ],
    },
    {
      key: "review",
      title: "Review & submit",
      blurb: "Last chance to add anything. You can still talk to us about changes after submitting.",
      fields: [
        {
          key: "additionalInfo",
          label: "Anything else you would like us to know?",
          type: "textarea",
          max: 1200,
        },
        {
          key: "declaration",
          label: "I confirm the information above is accurate to the best of my knowledge",
          type: "select",
          required: true,
          options: ["Yes, I confirm"],
          hint: "Institutions and immigration authorities act on what you tell us.",
        },
      ],
    },
  ],
};

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

const DEFINITIONS = { study: STUDY, career: CAREER, business: BUSINESS } as const;

export function intakeFor(pathway: keyof typeof DEFINITIONS): IntakeDefinition {
  return DEFINITIONS[pathway];
}

/* ------------------------------------------------------------- validation */

/**
 * Whitelist, coerce and (optionally) require.
 *
 * Runs on the SERVER for every save and every submit. Keys the step does not
 * define are dropped rather than rejected — a stale browser tab posting an old
 * field should not fail the whole save, but it must not write that field either.
 */
export function validateStep(
  step: IntakeStep,
  answers: Record<string, unknown>,
  opts: { requireAll: boolean }
): { clean: Record<string, unknown>; missing: string[] } {
  const clean: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const field of step.fields) {
    const raw = answers[field.key];
    let value: unknown;

    if (field.type === "multiselect") {
      const list = Array.isArray(raw) ? raw : [];
      value = list
        .filter((v): v is string => typeof v === "string")
        // Only values the question actually offered.
        .filter((v) => !field.options || field.options.includes(v))
        .slice(0, 30);
      if (opts.requireAll && field.required && (value as string[]).length === 0) {
        missing.push(field.label);
      }
      // An empty array is a meaningful "answered, chose nothing" only once the
      // key exists; don't write it on a save that never touched this field.
      if (raw !== undefined) clean[field.key] = value;
      continue;
    }

    if (raw === undefined || raw === null) {
      if (opts.requireAll && field.required) missing.push(field.label);
      continue;
    }

    const text = String(raw).trim().slice(0, field.max ?? 500);

    if (field.type === "select" && field.options && text && !field.options.includes(text)) {
      // A value outside the offered set is dropped, not stored.
      if (opts.requireAll && field.required) missing.push(field.label);
      continue;
    }

    if (!text) {
      if (opts.requireAll && field.required) missing.push(field.label);
      clean[field.key] = "";
      continue;
    }

    value = field.type === "number" ? Number(text) : text;
    if (field.type === "number" && !Number.isFinite(value as number)) {
      if (opts.requireAll && field.required) missing.push(field.label);
      continue;
    }

    clean[field.key] = value;
  }

  return { clean, missing };
}

/** Percentage of required fields answered, across the whole definition. */
export function intakeCompletion(
  definition: IntakeDefinition,
  data: Record<string, unknown>
): { percent: number; answered: number; total: number } {
  const required = definition.steps.flatMap((s) => s.fields.filter((f) => f.required));
  if (!required.length) return { percent: 100, answered: 0, total: 0 };

  const answered = required.filter((f) => {
    const v = data[f.key];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  }).length;

  return {
    percent: Math.round((answered / required.length) * 100),
    answered,
    total: required.length,
  };
}

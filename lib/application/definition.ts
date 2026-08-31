import type { IntakeDefinition, IntakeField } from "./types.ts";
import { DESTINATIONS, EDUCATION_LEVELS, LANGUAGE_LEVELS } from "./reference.ts";

/**
 * THE STUDENT APPLICATION — nine sections.
 * ---------------------------------------------------------------------------
 * Every question a European university asks, in the order they ask it, so a
 * student fills it in once and we submit it everywhere.
 *
 * THE WORDING IS PART OF THE FORM. Each hint here answers "why are you asking
 * me this?" — that a passport mismatch is the commonest reason a file comes
 * back, that embassies ask about study gaps directly, that a hidden visa
 * refusal usually ends an application while a declared one is manageable.
 * Fields without that context get guessed at, and a guessed answer on an
 * admissions form is worse than a blank one.
 *
 * Nothing here promises an outcome. Where a question touches on visas, funding
 * or employment, the wording stays neutral.
 */

const EDUCATION_ITEM: IntakeField[] = [
  { key: "eduLevel", label: "Level of education", type: "select", options: [...EDUCATION_LEVELS], required: true },
  { key: "eduCountry", label: "Country", type: "select", source: "countries", required: true },
  {
    key: "eduSchool",
    label: "Official name of school / university",
    type: "text",
    required: true,
    wide: true,
    max: 160,
    placeholder: "Full official name, no abbreviations",
    hint: "Write it exactly as it appears on your certificate.",
  },
  { key: "eduProgramme", label: "Programme name", type: "text", max: 160, placeholder: "e.g. Pre-Engineering, BS Computer Science" },
  { key: "eduDegree", label: "Awarded qualification / degree", type: "text", max: 160, placeholder: "e.g. Higher Secondary School Certificate" },
  { key: "eduStart", label: "Start of studies", type: "date", required: true, dateMin: "-60y", dateMax: "today" },
  {
    key: "eduEnd",
    label: "(Expected) graduation",
    type: "date",
    required: true,
    dateMin: "-60y",
    dateMax: "+10y",
    hint: "If you haven't finished, use your expected date.",
  },
  { key: "eduGrade", label: "Grade / GPA obtained", type: "text", required: true, max: 40, placeholder: "e.g. 872 or 3.4" },
  {
    key: "eduMax",
    label: "Out of (maximum possible)",
    type: "text",
    required: true,
    max: 40,
    placeholder: "e.g. 1100 or 4.0",
    hint: "Universities convert your grade — they need both numbers.",
  },
  {
    key: "eduLang",
    label: "Language of instruction",
    type: "select",
    source: "languages",
    hint: "If this was English, it may serve as your MOI proof.",
  },
  { key: "eduBoard", label: "Board / awarding body", type: "text", max: 120, placeholder: "e.g. BISE Sukkur, HEC-recognised" },
];

const LANGUAGE_ITEM: IntakeField[] = [
  { key: "olLang", label: "Language", type: "select", source: "languages" },
  { key: "olLevel", label: "Level", type: "select", options: [...LANGUAGE_LEVELS] },
  {
    key: "olTest",
    label: "Test or certificate, if you have one",
    type: "text",
    wide: true,
    max: 120,
    placeholder: "e.g. Goethe-Zertifikat B1, 2025",
  },
];

const WORK_ITEM: IntakeField[] = [
  { key: "wkTitle", label: "Job title", type: "text", max: 120 },
  { key: "wkEmployer", label: "Employer", type: "text", max: 120 },
  { key: "wkFrom", label: "From", type: "date", dateMin: "-60y", dateMax: "today" },
  { key: "wkTo", label: "To", type: "date", dateMin: "-60y", dateMax: "+1y", hint: "Leave blank if you still work there." },
  {
    key: "wkDuties",
    label: "What you actually did",
    type: "textarea",
    wide: true,
    rows: 2,
    max: 800,
    placeholder: "Two or three lines. Concrete tasks beat job-description language.",
  },
];

const SPONSOR_ONLY = { key: "funder", notEquals: "Self-funded (my own savings)" } as const;
const TOOK_A_TEST = { key: "engTest", notEquals: "Not taken yet" } as const;

export const STUDY_APPLICATION: IntakeDefinition = {
  pathway: "study",
  title: "Student application",
  steps: [
    /* ═══════════════════════════════════════════════════ 01 ═══ */
    {
      key: "application",
      title: "Application",
      blurb: "What are you applying for?",
      intro:
        "This decides which documents you'll be asked for later, so take a moment on it. Everything you enter here goes straight onto the university's own form — write your details exactly as they appear in your passport.",
      cards: [
        { startsAt: "applyLevel", title: "Study plan" },
        {
          startsAt: "prio1",
          title: "Programme priorities",
          blurb:
            "Universities let you name up to three programme choices in priority order. If you're not sure which programmes exist, write the subject area and your advisor will fill the rest.",
        },
        { startsAt: "source", title: "How you found us" },
      ],
      fields: [
        {
          key: "applyLevel",
          label: "Level you're applying for",
          type: "select",
          required: true,
          options: [
            "Bachelor's degree (undergraduate)",
            "Master's degree (postgraduate)",
            "Foundation / preparatory year",
            "Language course",
            "PhD / doctoral",
          ],
          hint: "Bachelor's and Master's applicants are asked for different documents.",
        },
        {
          key: "intake",
          label: "Intake you want to start",
          type: "select",
          required: true,
          options: [
            "Autumn / September 2026",
            "Spring / February 2027",
            "Autumn / September 2027",
            "Earliest possible intake",
          ],
        },
        {
          key: "dest",
          label: "Destination countries you'd consider",
          type: "multiselect",
          required: true,
          wide: true,
          options: [...DESTINATIONS],
          hint: "Choose every country you'd genuinely accept. More options means more offers.",
        },
        {
          key: "prio1",
          label: "First choice — programme and university",
          type: "text",
          required: true,
          wide: true,
          max: 200,
          placeholder: "e.g. Business Development and Entrepreneurship — Vilnius Business College",
        },
        {
          key: "prio2",
          label: "Second choice",
          type: "text",
          wide: true,
          max: 200,
          placeholder: "e.g. International E-Business and Commerce — Vilnius Business College",
        },
        { key: "prio3", label: "Third choice", type: "text", wide: true, max: 200, placeholder: "Optional" },
        {
          key: "subjectArea",
          label: "If you're unsure, what do you want to study?",
          type: "text",
          wide: true,
          max: 200,
          placeholder: "e.g. computer science, nursing, logistics, business",
          hint: "Your advisor will shortlist programmes that match your grades and budget.",
        },
        {
          key: "source",
          label: "How did you hear about SnZ Ventures?",
          type: "select",
          options: [
            "Instagram",
            "Facebook",
            "TikTok",
            "LinkedIn",
            "YouTube",
            "Google search",
            "Referred by a friend or family member",
            "Referred by a former SnZ student",
            "Education fair or seminar",
            "Other",
          ],
        },
        {
          key: "referrer",
          label: "Name of the person who referred you",
          type: "text",
          max: 120,
          placeholder: "Leave blank if nobody referred you",
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 02 ═══ */
    {
      key: "profile",
      title: "Profile",
      blurb: "Your identity, exactly as your passport shows it",
      intro:
        "Universities match every document against your passport. A single spelling difference between your form and your passport is the most common reason an application is sent back — so copy the passport character by character, including middle names.",
      cards: [
        { startsAt: "givenName", title: "Name and gender" },
        { startsAt: "dob", title: "Birth and citizenship" },
        {
          startsAt: "cnic",
          title: "National identity card",
          blurb:
            "Pakistani applicants: your CNIC. Other nationalities: your national ID number, or leave blank if your country doesn't issue one.",
        },
        { startsAt: "passportNo", title: "Passport" },
        { startsAt: "trp", title: "Residence status" },
        {
          startsAt: "photo",
          title: "Passport photograph",
          blurb:
            "A plain white background, face straight to camera, no glasses, no headwear except for religious reasons. Universities crop this to 35 × 45 mm automatically, so leave a little space around your head.",
        },
      ],
      fields: [
        {
          key: "givenName",
          label: "Given name(s)",
          type: "text",
          required: true,
          max: 120,
          placeholder: "As printed in your passport",
          hint: "Include middle names if your passport has them.",
        },
        {
          key: "familyName",
          label: "Family name",
          type: "text",
          required: true,
          max: 120,
          placeholder: "Surname as printed in your passport",
          hint: "If your passport shows no surname, write your father's name here and tell your advisor.",
        },
        { key: "gender", label: "Gender", type: "select", required: true, options: ["Male", "Female", "Other"] },
        {
          key: "maritalStatus",
          label: "Marital status",
          type: "select",
          options: ["Single", "Married", "Divorced", "Widowed"],
          hint: "Asked on residence permit applications, not by every university.",
        },
        {
          key: "fatherName",
          label: "Father's full name",
          type: "text",
          required: true,
          max: 120,
          placeholder: "As shown on your CNIC / B-Form",
        },
        {
          key: "motherName",
          label: "Mother's full name",
          type: "text",
          max: 120,
          placeholder: "Required for some visa applications",
        },
        {
          key: "dob",
          label: "Date of birth",
          type: "date",
          required: true,
          dateMin: "-100y",
          dateMax: "2016-01-01",
          hint: "Universities display this as yyyy-mm-dd.",
        },
        { key: "birthCountry", label: "Country of birth", type: "select", source: "countries", required: true },
        {
          key: "birthPlace",
          label: "Place of birth (city / town)",
          type: "text",
          required: true,
          max: 120,
          placeholder: "e.g. Sukkur",
        },
        { key: "citizenship", label: "Citizenship", type: "select", source: "countries", required: true },
        { key: "dualCit", label: "I hold a second citizenship", type: "checkbox", wide: true },
        {
          key: "citizenship2",
          label: "Second citizenship",
          type: "select",
          source: "countries",
          showWhen: { key: "dualCit", truthy: true },
        },
        {
          key: "cnic",
          label: "CNIC / national ID number",
          type: "text",
          required: true,
          mask: "cnic",
          max: 15,
          placeholder: "00000-0000000-0",
          hint: "13 digits. Dashes are added for you.",
        },
        {
          key: "cnicExpiry",
          label: "CNIC expiry date",
          type: "date",
          dateMin: "-10y",
          dateMax: "+30y",
          hint: "Write “Lifetime” in the notes below if your card doesn't expire.",
        },
        {
          key: "passportNo",
          label: "Passport number",
          type: "text",
          required: true,
          mask: "upper",
          max: 20,
          placeholder: "e.g. AB1234567",
        },
        { key: "passportAuth", label: "Issuing authority / country", type: "select", source: "countries" },
        {
          key: "passportIssue",
          label: "Issue date",
          type: "date",
          required: true,
          dateMin: "-20y",
          dateMax: "today",
        },
        {
          key: "passportExpiry",
          label: "Expiry date",
          type: "date",
          required: true,
          dateMin: "today",
          dateMax: "+20y",
          hint: "Must stay valid for at least 15 months after your intake.",
        },
        { key: "noPassport", label: "I don't have a passport yet", type: "checkbox", wide: true },
        {
          key: "noPassportNote",
          label: "",
          type: "note",
          wide: true,
          tone: "info",
          showWhen: { key: "noPassport", truthy: true },
          body:
            "Apply for it this week. Universities will accept your application without a passport, but they cannot issue an admission letter or start your residence permit without one. Tell your advisor your expected collection date.",
        },
        {
          key: "trp",
          label: "Do you currently hold a residence permit for any EU country?",
          type: "radio",
          required: true,
          wide: true,
          options: ["No", "Yes"],
        },
        {
          key: "trpCountry",
          label: "Which country?",
          type: "select",
          source: "countries",
          showWhen: { key: "trp", equals: "Yes" },
        },
        {
          key: "trpExpiry",
          label: "Permit valid until",
          type: "date",
          dateMin: "-5y",
          dateMax: "+20y",
          showWhen: { key: "trp", equals: "Yes" },
        },
        {
          key: "refusal",
          label: "Have you ever been refused a visa by any country?",
          type: "radio",
          required: true,
          wide: true,
          options: ["No", "Yes"],
          hint: "Answer honestly. A declared refusal is manageable; a hidden one that surfaces later usually ends the application.",
        },
        {
          key: "refusalDetail",
          label: "Country, year, visa type and the reason given",
          type: "textarea",
          wide: true,
          max: 1000,
          showWhen: { key: "refusal", equals: "Yes" },
          placeholder: "e.g. Poland, 2024, national student visa (D). Refused for insufficient proof of funds.",
        },
        {
          key: "prevTravel",
          label: "Countries you have travelled to in the last 10 years",
          type: "text",
          wide: true,
          max: 400,
          placeholder: "e.g. UAE (2023), Saudi Arabia (2019) — or write None",
        },
        { key: "photo", label: "Passport photograph", type: "documents", wide: true, only: ["PHOTO"] },
      ],
    },

    /* ═══════════════════════════════════════════════════ 03 ═══ */
    {
      key: "contacts",
      title: "Contacts",
      blurb: "Where we can reach you",
      intro:
        "Use an email address you check daily and will still control in two years. University decisions, visa appointments and enrolment codes all arrive by email — a missed message can cost you an intake.",
      cards: [
        { startsAt: "email", title: "Email and phone" },
        {
          startsAt: "street",
          title: "Home address",
          blurb:
            "Your permanent address as it appears on your CNIC or utility bills. Universities print this on admission letters and embassies check it.",
        },
        {
          startsAt: "ecName",
          title: "Emergency contact",
          blurb:
            "Every European university requires one. Please tell this person that their name and number are being shared — that responsibility sits with you, not with us.",
        },
      ],
      fields: [
        {
          key: "email",
          label: "Email address",
          type: "email",
          required: true,
          max: 160,
          placeholder: "you@example.com",
          hint: "Use a personal address, not a school or work one.",
        },
        {
          key: "email2",
          label: "Confirm email address",
          type: "email",
          required: true,
          max: 160,
          placeholder: "Type it again",
          mustMatch: "email",
        },
        {
          key: "dial",
          label: "Country code",
          type: "text",
          max: 8,
          defaultValue: "+92",
          placeholder: "+92",
          hint: "Fills in from your citizenship.",
        },
        {
          key: "mobile",
          label: "Mobile number",
          type: "tel",
          required: true,
          max: 40,
          placeholder: "300 1234567",
          hint: "Include the country code, e.g. +92 300 1234567.",
        },
        {
          key: "whatsapp",
          label: "WhatsApp number",
          type: "tel",
          max: 40,
          placeholder: "Leave blank if same as mobile",
          hint: "This is how your advisor will usually contact you.",
        },
        {
          key: "street",
          label: "Street address",
          type: "textarea",
          required: true,
          wide: true,
          rows: 2,
          max: 400,
          placeholder: "House / flat number, street name, area",
        },
        { key: "city", label: "City, province, region", type: "text", required: true, max: 120, placeholder: "e.g. Sukkur, Sindh" },
        { key: "postal", label: "Postal code", type: "text", required: true, max: 20, placeholder: "e.g. 65200" },
        { key: "country", label: "Country", type: "select", source: "countries", required: true },
        { key: "ecName", label: "Full name", type: "text", required: true, max: 120 },
        {
          key: "ecRelation",
          label: "Relation to you",
          type: "text",
          required: true,
          max: 80,
          placeholder: "e.g. father, mother, sibling, spouse",
        },
        { key: "ecPhone", label: "Telephone", type: "tel", required: true, max: 40, placeholder: "+92 300 1234567" },
        { key: "ecEmail", label: "Email address", type: "email", max: 160 },
      ],
    },

    /* ═══════════════════════════════════════════════════ 04 ═══ */
    {
      key: "education",
      title: "Education",
      blurb: "Everything you've studied, oldest first",
      intro:
        "Start with secondary school (Matric / SSC or O-Levels), then add each qualification after it. If you haven't finished your current studies, enter the year you expect to graduate. Gaps of more than six months need an explanation — there's a box for that below.",
      cards: [{ startsAt: "gapExplain", title: "Study gaps" }],
      fields: [
        {
          key: "edu",
          label: "Qualifications",
          type: "repeater",
          wide: true,
          required: true,
          item: EDUCATION_ITEM,
          itemLabel: "Qualification",
          minItems: 1,
          maxItems: 10,
        },
        {
          key: "gapExplain",
          label: "Explain any period of six months or more when you were not studying",
          type: "textarea",
          wide: true,
          max: 1200,
          placeholder:
            "e.g. 2023–2024: worked full time at my family's business in Sukkur to fund my studies. Write None if this doesn't apply.",
          hint: "Embassies ask about gaps directly. A clear, honest answer here becomes your visa answer later.",
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 05 ═══ */
    {
      key: "languages",
      title: "Languages",
      blurb: "Your language ability",
      intro:
        "Nearly every English-taught programme in the EU requires proof of English. If you haven't taken a test yet, say so — some of our partner universities accept an online interview instead, and your advisor will tell you which.",
      cards: [
        { startsAt: "nativeLang", title: "Native language" },
        { startsAt: "engTest", title: "Proof of English" },
        {
          startsAt: "otherLangs",
          title: "Other languages",
          blurb:
            "Add any language you can use beyond your native one. Even basic German, Lithuanian or Polish strengthens a residence permit file.",
        },
      ],
      fields: [
        { key: "nativeLang", label: "Your native language", type: "select", source: "languages", required: true },
        {
          key: "engTest",
          label: "Which English test have you taken?",
          type: "radio",
          required: true,
          wide: true,
          options: [
            "IELTS Academic",
            "IELTS UKVI",
            "PTE Academic",
            "TOEFL iBT",
            "Duolingo English Test",
            "Medium of instruction letter",
            "Not taken yet",
          ],
        },
        { key: "engOverall", label: "Overall score / band", type: "text", max: 20, placeholder: "e.g. 6.5", showWhen: TOOK_A_TEST },
        {
          key: "engDate",
          label: "Test date",
          type: "date",
          dateMin: "-10y",
          dateMax: "today",
          hint: "Most results expire after two years.",
          showWhen: TOOK_A_TEST,
        },
        { key: "engListening", label: "Listening", type: "text", max: 20, placeholder: "e.g. 6.5", showWhen: TOOK_A_TEST },
        { key: "engReading", label: "Reading", type: "text", max: 20, placeholder: "e.g. 6.0", showWhen: TOOK_A_TEST },
        { key: "engWriting", label: "Writing", type: "text", max: 20, placeholder: "e.g. 6.0", showWhen: TOOK_A_TEST },
        { key: "engSpeaking", label: "Speaking", type: "text", max: 20, placeholder: "e.g. 7.0", showWhen: TOOK_A_TEST },
        {
          key: "engTrf",
          label: "TRF / registration number",
          type: "text",
          wide: true,
          max: 60,
          placeholder: "Printed on your result card",
          hint: "Universities verify results online using this number.",
          showWhen: TOOK_A_TEST,
        },
        {
          key: "engPlanDate",
          label: "When will you take the test?",
          type: "date",
          dateMin: "today",
          dateMax: "+3y",
          showWhen: { key: "engTest", equals: "Not taken yet" },
        },
        {
          key: "engSelfLevel",
          label: "How would you rate your English now?",
          type: "select",
          showWhen: { key: "engTest", equals: "Not taken yet" },
          options: [
            "Basic — simple conversations only",
            "Intermediate — comfortable in everyday situations",
            "Advanced — I study or work in English",
            "Fluent",
          ],
        },
        {
          key: "otherLangs",
          label: "Other languages",
          type: "repeater",
          wide: true,
          item: LANGUAGE_ITEM,
          itemLabel: "Language",
          maxItems: 8,
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 06 ═══ */
    {
      key: "motivation",
      title: "Motivation",
      blurb: "Why you, and why this programme",
      intro:
        "Don't write a letter here. Answer the five questions below in plain sentences and we'll assemble the motivation letter for you — the draft builds itself as you type. Write in your own words; admissions officers recognise copied letters immediately.",
      cards: [
        { startsAt: "mQ1", title: "The five questions" },
        {
          startsAt: "motivationDraft",
          title: "Your assembled draft",
          blurb:
            "This is a working draft built from your answers. Your advisor will edit it into a final letter on SnZ letterhead before anything is submitted.",
        },
        {
          startsAt: "work",
          title: "Work experience",
          blurb:
            "Optional for Bachelor's applicants. Strongly recommended for Master's — it often decides borderline cases.",
        },
      ],
      fields: [
        {
          key: "mQ1",
          label: "1. Why this subject? What made you choose it?",
          type: "textarea",
          required: true,
          wide: true,
          countWords: true,
          max: 2000,
          placeholder:
            "A specific moment works better than a general statement. e.g. I started managing my father's shop inventory on a spreadsheet at sixteen and realised the numbers were telling a story nobody was reading.",
        },
        {
          key: "mQ2",
          label: "2. What have you already done in this field?",
          type: "textarea",
          required: true,
          wide: true,
          countWords: true,
          max: 2000,
          placeholder: "Studies, projects, jobs, internships, self-taught skills, volunteering, competitions.",
        },
        {
          key: "mQ3",
          label: "3. Why this country and this university specifically?",
          type: "textarea",
          required: true,
          wide: true,
          countWords: true,
          max: 2000,
          placeholder:
            "Name something real: a module, a lab, an industry the country is strong in. Avoid saying only that the tuition is affordable.",
        },
        {
          key: "mQ4",
          label: "4. What do you want to be doing five years after you graduate?",
          type: "textarea",
          required: true,
          wide: true,
          countWords: true,
          max: 2000,
          placeholder: "Be concrete about the role and the place. Admissions and visa officers both read this.",
        },
        {
          key: "mQ5",
          label: "5. What will you bring to the university?",
          type: "textarea",
          required: true,
          wide: true,
          countWords: true,
          max: 2000,
          placeholder: "Languages, leadership, a skill, a perspective, community work.",
        },
        { key: "motivationDraft", label: "Letter of motivation — draft", type: "derived", wide: true },
        {
          key: "work",
          label: "Work experience",
          type: "repeater",
          wide: true,
          item: WORK_ITEM,
          itemLabel: "Role",
          maxItems: 10,
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 07 ═══ */
    {
      key: "finances",
      title: "Finances",
      blurb: "How your studies will be paid for",
      intro:
        "This is the section that decides visas. Embassies want to see that tuition and roughly a year of living costs are genuinely available, in an account with a traceable history. We would rather tell you now that the numbers don't work than after you've paid anything.",
      cards: [
        { startsAt: "funder", title: "Funding" },
        { startsAt: "accommodation", title: "Practical needs" },
      ],
      fields: [
        {
          key: "funder",
          label: "Who is funding your studies?",
          type: "select",
          required: true,
          options: [
            "Self-funded (my own savings)",
            "Parents",
            "Sibling or other relative",
            "Spouse",
            "Employer",
            "Scholarship or government grant",
            "Bank loan",
          ],
        },
        {
          key: "budget",
          label: "Total budget available for year one (EUR)",
          type: "select",
          required: true,
          options: ["Under €6,000", "€6,000 – €10,000", "€10,000 – €15,000", "€15,000 – €25,000", "Over €25,000"],
          hint: "Tuition plus living costs. Be realistic, not optimistic.",
        },
        {
          key: "fundsReady",
          label: "Are the funds already in a bank account?",
          type: "radio",
          required: true,
          wide: true,
          options: ["Yes, already deposited", "Partly", "Not yet, arranging"],
          hint: "Most embassies want the money to have been sitting in the account for three to six months.",
        },
        { key: "spName", label: "Sponsor's full name", type: "text", max: 120, showWhen: SPONSOR_ONLY },
        { key: "spRelation", label: "Relation to you", type: "text", max: 80, placeholder: "e.g. father", showWhen: SPONSOR_ONLY },
        { key: "spJob", label: "Sponsor's occupation", type: "text", max: 120, showWhen: SPONSOR_ONLY },
        {
          key: "spIncome",
          label: "Sponsor's annual income",
          type: "text",
          max: 60,
          placeholder: "With currency, e.g. PKR 4,800,000",
          showWhen: SPONSOR_ONLY,
        },
        { key: "spBank", label: "Bank name", type: "text", max: 120, showWhen: SPONSOR_ONLY },
        { key: "spCnic", label: "Sponsor's CNIC / ID number", type: "text", max: 40, showWhen: SPONSOR_ONLY },
        {
          key: "accommodation",
          label: "Will you need student accommodation?",
          type: "select",
          options: [
            "Yes, please arrange a dormitory place",
            "Yes, I want a private flat",
            "No, I have somewhere to stay",
            "Not decided yet",
          ],
        },
        {
          key: "dependants",
          label: "Will family travel with you?",
          type: "select",
          options: ["No, travelling alone", "Yes, spouse", "Yes, spouse and children", "Undecided"],
        },
        {
          key: "medical",
          label: "Medical conditions, disabilities or access needs we should know about",
          type: "textarea",
          wide: true,
          max: 1200,
          placeholder:
            "Shared only with the university's support team, and only when it helps you. Write None if this doesn't apply.",
        },
        {
          key: "notes",
          label: "Anything else your advisor should know",
          type: "textarea",
          wide: true,
          max: 1500,
          placeholder:
            "Deadlines, family circumstances, a second passport, an unusual grading system — anything that affects your case.",
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 08 ═══ */
    {
      key: "documents",
      title: "Documents",
      blurb: "Your document file",
      intro:
        "This list changes based on the level you chose in section 01. Rename every file to the name shown in the dark bar before you upload it — universities process hundreds of files a day, and correctly named documents are the difference between a fast decision and a lost application.",
      cards: [{ startsAt: "scanNote", title: "Scanning standards" }],
      fields: [
        {
          key: "namingNote",
          label: "Naming rule",
          type: "note",
          wide: true,
          tone: "info",
          body:
            "Every file is named SURNAME_GivenName_DOCUMENT.pdf — all capitals for the surname, no spaces, no brackets, no version numbers. Each slot below shows you the exact name to use, with a copy button.",
        },
        {
          key: "scanNote",
          label: "",
          type: "note",
          wide: true,
          body:
            "Scan or photograph in colour at 300 dpi or better, on a flat surface with all four corners visible. No screenshots, no cropped edges, no shadows across the text. PDF for documents, JPEG for the passport photo only. Each file must stay under 5 MB.",
        },
        { key: "documents", label: "Your documents", type: "documents", wide: true, required: true },
        {
          key: "translationNote",
          label: "Documents not in English",
          type: "note",
          wide: true,
          tone: "info",
          body:
            "Documents in Urdu, Sindhi or any non-English language must be translated by a certified translator and the translation attached behind the original in the same PDF. Your advisor will tell you which of your documents need this.",
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 09 ═══ */
    {
      key: "review",
      title: "Review",
      blurb: "Check it, then send it",
      intro:
        "Read this the way an admissions officer will. Anything marked in red is missing — use the Edit button on a section to go back and fix it.",
      cards: [{ startsAt: "cTrue", title: "Declaration" }],
      fields: [
        { key: "reviewSummary", label: "", type: "review", wide: true },
        {
          key: "cTrue",
          label:
            "Everything I have entered is true and matches my passport and original documents. I understand that a false statement can end my application and may lead to a visa ban.",
          type: "checkbox",
          required: true,
          wide: true,
        },
        {
          key: "cShare",
          label:
            "I authorise SnZ Ventures to submit this information and my documents to universities and immigration authorities on my behalf.",
          type: "checkbox",
          required: true,
          wide: true,
        },
        {
          key: "cGdpr",
          label:
            "I have read the privacy policy and consent to SnZ Ventures processing my personal data under the GDPR for the purpose of my application.",
          type: "checkbox",
          required: true,
          wide: true,
        },
        {
          key: "cContact",
          label:
            "I'd like to hear about scholarships, intakes and deadlines relevant to my case. (Optional — you can stop this any time.)",
          type: "checkbox",
          wide: true,
        },
      ],
    },

    /* ═══════════════════════════════════════════════════ 10 ═══ */
    {
      key: "undertaking",
      title: "Consent & undertaking",
      blurb: "The agreement that lets us act for you",
      intro:
        "This is the last thing, and it is the one that authorises us to send your file to universities and immigration authorities. Read it properly — it is the same document you would sign on paper in our office, and nothing is submitted until you have.",
      cards: [{ startsAt: "undertakingAccepted", title: "Your signature" }],
      fields: [
        { key: "undertakingDoc", label: "", type: "consent", wide: true },
        {
          key: "undertakingAccepted",
          label:
            "I have read, understood, and agreed to the Student Consent & Undertaking above.",
          type: "checkbox",
          required: true,
          wide: true,
        },
        {
          key: "undertakingSignature",
          label: "Type your full name as your signature",
          type: "text",
          required: true,
          wide: true,
          max: 160,
          placeholder: "Your full name, as on your passport",
          hint: "Typed by you, with the date, time and version of the document, is what makes this a record we can stand behind.",
        },
      ],
    },
  ],
};

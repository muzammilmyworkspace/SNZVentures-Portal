import type { PathwayKey } from "./pathways";

/**
 * SERVICES — every entry below is verified against the live snzventures.com.
 * No service, deliverable or capability here was invented.
 */

export type FAQ = { q: string; a: string };

export type Service = {
  slug: string;
  pathway: PathwayKey;
  name: string;
  /** Nav / card one-liner. */
  tagline: string;
  image: string;
  imageAlt: string;
  hero: { eyebrow: string; title: string; lead: string };
  problem: { title: string; body: string; points: string[] };
  solution: { title: string; body: string };
  deliverables: { title: string; body: string }[];
  whoFor: string[];
  process: { step: string; name: string; body: string }[];
  faqs: FAQ[];
  related: string[];
  /** Rendered verbatim near the CTA. Non-negotiable — legal safety. */
  caveat: string;
};

export const services: Service[] = [
  {
    slug: "company-formation",
    pathway: "business",
    name: "Company Formation & Accounting",
    tagline: "UAB / MB incorporation, VAT, EORI, payroll and ongoing filings.",
    image: "/images/path-business.webp",
    imageAlt: "Glass office towers rising against the sky",
    hero: {
      eyebrow: "Business Setup",
      title: "An EU Company Is the Key. Not the Door.",
      lead: "Incorporation in Lithuania is fast. Staying compliant, banked and operational for the next three years is the part that decides whether the company was worth registering.",
    },
    problem: {
      title: "Most Formation Packages Stop the Day the Certificate Arrives",
      body: "Founders are sold a registration, then discover the entity cannot transact. The bank declines the account. VAT is not filed. Payroll has no operator. The company legally exists and practically does nothing.",
      points: [
        "A registered entity with no banking relationship",
        "VAT and EORI missed, blocking invoicing and imports",
        "Monthly accounting and payroll left unassigned",
        "Annual filings discovered late, with penalties attached",
      ],
    },
    solution: {
      title: "Formation, Banking and Bookkeeping Treated as One Job",
      body: "We incorporate the entity, register it for what it actually needs, and keep the accounting running afterwards. One coordinator holds the sequence, so nothing sits waiting on someone else's inbox.",
    },
    deliverables: [
      {
        title: "UAB or MB Incorporation",
        body: "Entity type chosen against your capital, ownership and liability position — not by default.",
      },
      {
        title: "Legal Address",
        body: "A registered office in Lithuania that satisfies the statutory requirement.",
      },
      {
        title: "VAT & EORI Registration",
        body: "So the company can invoice inside the single market and move goods across its border.",
      },
      {
        title: "Payroll & Accounting",
        body: "Monthly bookkeeping, payroll operation and statutory reporting on an ongoing basis.",
      },
      {
        title: "Corporate Secretarial",
        body: "Resolutions, register maintenance and annual filings kept current.",
      },
    ],
    whoFor: [
      "Founders establishing a first European entity",
      "Companies opening an EU subsidiary or branch",
      "Investors needing a compliant holding structure",
      "Businesses that already registered and are now stuck",
    ],
    process: [
      { step: "01", name: "Structure", body: "Entity type, ownership split and share capital agreed." },
      { step: "02", name: "Incorporate", body: "Documents prepared, signed and filed with the register." },
      { step: "03", name: "Register", body: "VAT, EORI and employer registrations as your activity requires." },
      { step: "04", name: "Bank", body: "Introduction and account application support with the institution." },
      { step: "05", name: "Operate", body: "Monthly accounting, payroll and filings from the first period." },
    ],
    faqs: [
      {
        q: "How long does registration take?",
        a: "Lithuanian company registration typically completes within a 48-hour window once documents are correctly prepared and signed. Preparation and notarisation before that point, and banking afterwards, both take longer — plan for the full sequence rather than the filing alone.",
      },
      {
        q: "Do I need to be in Lithuania in person?",
        a: "Not necessarily. Remote incorporation is possible in many cases via power of attorney or electronic signature. Banking is the step most likely to require your physical presence or a video verification. We confirm which applies to your case before you book travel.",
      },
      {
        q: "Does forming a company give me residence?",
        a: "No. Company ownership and the right to live in Lithuania are separate legal processes with separate criteria. Owning an entity may support a residence application but does not grant one. See Investor Relocation for how the two connect.",
      },
      {
        q: "Can you guarantee a bank account?",
        a: "No, and treat anyone who does with caution. Account opening is the bank's decision, made on their own compliance assessment. We prepare the application to the standard they expect and make the introduction — the outcome remains theirs.",
      },
      {
        q: "UAB or MB — which one?",
        a: "An MB is lighter and cheaper to run with fewer members and no minimum share capital, but it restricts ownership and investment structure. A UAB is the standard private limited company and is usually required for licensing, outside investment or hiring at scale. We advise on your specific case.",
      },
    ],
    related: ["fintech-licensing", "investor-relocation"],
    caveat:
      "SnZ Ventures is an advisory firm. Notarial, audit and legal filings are executed by licensed Lithuanian partner firms. Registration timelines depend on the register and on document readiness, and banking decisions rest solely with the financial institution.",
  },
  {
    slug: "fintech-licensing",
    pathway: "business",
    name: "Fintech Establishment & Licensing",
    tagline: "EMI, PI, specialised bank and crypto authorisation.",
    image: "/images/atmos-fintech.webp",
    imageAlt: "Earth at night from orbit, city lights forming a connected network",
    hero: {
      eyebrow: "Business Setup",
      title: "Lithuania Licenses More Fintechs than Anywhere Else in the EU.",
      lead: "That is the opportunity and the reason the bar is high. Regulators here have seen every version of an underprepared application, and they decline them quickly.",
    },
    problem: {
      title: "Licensing Applications Fail on Evidence, Not Ambition",
      body: "The business model is rarely the reason an application stalls. It stalls because the governance structure is thin, the AML framework is generic, the capital is not demonstrably in place, or the named officers cannot be verified.",
      points: [
        "Policy documents copied from a template and visibly so",
        "No credible, appointable MLRO or compliance officer",
        "Initial capital not evidenced to the standard required",
        "Governance that cannot show substance in-country",
      ],
    },
    solution: {
      title: "Built to Be Assessed, Not Just Submitted",
      body: "We coordinate the entity, the capital position, the governance structure and the compliance framework, working with licensed partner firms and qualified officers. The application is assembled the way a supervisor reads it.",
    },
    deliverables: [
      {
        title: "Licence Scoping",
        body: "EMI, PI, specialised bank or crypto — matched to what you actually intend to do.",
      },
      {
        title: "Entity & Capital Structure",
        body: "The operating company, ownership chain and initial capital arranged to meet the threshold.",
      },
      {
        title: "Compliance Framework",
        body: "AML/CFT policies, risk assessment and internal controls built for your model.",
      },
      {
        title: "Officer Appointments",
        body: "Introduction to qualified MLRO and compliance candidates who will withstand assessment.",
      },
      {
        title: "SEPA Gateway Access",
        body: "Payment rail connectivity arranged for authorised institutions.",
      },
    ],
    whoFor: [
      "Payment and e-money businesses entering the EU",
      "Crypto-asset service providers seeking authorisation",
      "Non-EU fintechs needing a European base",
      "Groups restructuring an existing licence footprint",
    ],
    process: [
      { step: "01", name: "Scope", body: "Which licence your model genuinely requires — often not the one assumed." },
      { step: "02", name: "Structure", body: "Entity, ownership, capital and governance put in place." },
      { step: "03", name: "Build", body: "Compliance framework, policies and controls drafted to your risk profile." },
      { step: "04", name: "Staff", body: "Compliance and MLRO appointments arranged with qualified individuals." },
      { step: "05", name: "Submit", body: "Application filed and supervisor correspondence managed by licensed partners." },
    ],
    faqs: [
      {
        q: "How long does a licence take?",
        a: "It varies substantially by licence type, application quality and supervisor workload, and it is measured in months rather than weeks. Any firm quoting you a fixed date at first contact is guessing. We give you a realistic range once we have scoped your model.",
      },
      {
        q: "Can you guarantee the licence is granted?",
        a: "No. Authorisation is the regulator's decision alone. What can be controlled is the quality, completeness and credibility of what is submitted — which is where most applications are actually lost.",
      },
      {
        q: "Is SnZ Ventures regulated?",
        a: "No. SnZ Ventures is an advisory and coordination firm. Regulated activities — legal representation, audit, and the compliance officer functions themselves — are delivered by licensed partner firms and qualified individuals, named to you before you commit.",
      },
      {
        q: "What capital will I need?",
        a: "Minimum initial capital is set by licence category under EU and Lithuanian law and differs sharply between a payment institution, an e-money institution and a specialised bank. We confirm the applicable figure for your scope at the scoping stage.",
      },
      {
        q: "Do I need staff physically in Lithuania?",
        a: "Substance requirements mean a licensed institution is expected to have genuine local presence and decision-making, not a nameplate. The specifics depend on licence type and scale, and are part of what we scope with you.",
      },
    ],
    related: ["company-formation", "investor-relocation"],
    caveat:
      "SnZ Ventures is not a regulated financial institution and does not provide legal advice. Licence applications are prepared and submitted with licensed partner firms. Authorisation decisions rest solely with the Bank of Lithuania or the relevant competent authority.",
  },
  {
    slug: "investor-relocation",
    pathway: "business",
    name: "Investor Relocation",
    tagline: "Residence permits, family migration, property and settlement.",
    image: "/images/dest-vilnius.webp",
    imageAlt: "Vilnius skyline at dusk with the river and illuminated towers",
    hero: {
      eyebrow: "Business Setup",
      title: "Moving the Company Is One Project. Moving Your Family Is Another.",
      lead: "Founders routinely underestimate the second one. Permits, schooling, housing, tax residency and healthcare registration run on their own timelines — and they do not wait for the business.",
    },
    problem: {
      title: "The Permit Is Not the Hard Part. The Sequencing Is.",
      body: "Residence applications depend on the company being properly established, which depends on documents that take weeks to legalise abroad. Start them in the wrong order and the whole move slips a quarter.",
      points: [
        "Documents needing apostille or legalisation in the origin country",
        "Family members on separate application tracks to the principal",
        "Tax residency changing before anyone has planned for it",
        "Housing and schooling secured too late in the sequence",
      ],
    },
    solution: {
      title: "One Timeline Covering the Company, the Permit and the Household",
      body: "We map the dependencies once, in order, and run them in parallel where the law allows — so the residence track and the business track arrive at roughly the same time.",
    },
    deliverables: [
      {
        title: "Residence Permit Support",
        body: "Route assessment, document preparation and submission coordination.",
      },
      {
        title: "Family Migration",
        body: "Dependants handled on their own tracks alongside the principal applicant.",
      },
      {
        title: "Real Estate",
        body: "Introductions for purchase or long-term rental in Vilnius and other Lithuanian cities.",
      },
      {
        title: "Tax Planning",
        body: "Residency position reviewed with qualified advisors before the move, not after.",
      },
      {
        title: "Settlement Services",
        body: "Registration, healthcare, banking and schooling in the first months after arrival.",
      },
    ],
    whoFor: [
      "Founders relocating alongside a new EU entity",
      "Investors seeking Lithuanian residence",
      "Families moving together rather than sequentially",
      "Executives transferring into a European operation",
    ],
    process: [
      { step: "01", name: "Assess", body: "Which residence route genuinely fits your circumstances." },
      { step: "02", name: "Sequence", body: "Company, documents and permits ordered against real dependencies." },
      { step: "03", name: "Prepare", body: "Legalisation, translation and evidence assembled for each applicant." },
      { step: "04", name: "Submit", body: "Applications filed and tracked through the migration authority." },
      { step: "05", name: "Settle", body: "Arrival registration, housing, healthcare and schooling." },
    ],
    faqs: [
      {
        q: "Can you guarantee a residence permit?",
        a: "No. Permits are granted by the Lithuanian Migration Department against statutory criteria, and no advisor can commit to the outcome. We assess your eligibility honestly at the start and tell you if the route is weak.",
      },
      {
        q: "Does buying property give me residence?",
        a: "Lithuania does not operate a residence-by-property-investment scheme in the way some countries do. Property may form part of your circumstances but is not itself a route. Be sceptical of anyone marketing it as one.",
      },
      {
        q: "Can my family come with me?",
        a: "Family reunification routes exist for spouses and dependent children, with their own evidence requirements and processing times. They are best started alongside the principal application rather than after it.",
      },
      {
        q: "When does my tax residency change?",
        a: "Tax residency is determined by day-count and personal-ties tests, and can change in the same year you move. This has consequences in both countries, so we bring qualified tax advisors in before the move rather than after.",
      },
    ],
    related: ["company-formation", "fintech-licensing"],
    caveat:
      "Immigration outcomes are determined solely by the Lithuanian Migration Department. SnZ Ventures does not provide legal or tax advice; these are delivered by licensed partner firms. No permit, approval or timeline can be guaranteed.",
  },
  {
    slug: "international-recruitment",
    pathway: "careers",
    name: "International Recruitment",
    tagline: "White-collar and blue-collar placement across Europe.",
    image: "/images/path-careers.webp",
    imageAlt: "A calm modern office workspace beside a large window",
    hero: {
      eyebrow: "Global Careers",
      title: "Real Roles, Named Employers, Honest Eligibility.",
      lead: "We work as the outsourced hiring function for European SMEs and regulated firms — and we recruit from South Asia and the Middle East. Both sides of that corridor are our client.",
    },
    problem: {
      title: "This Industry Has an Honesty Problem, and Everyone Knows It",
      body: "Candidates are charged upfront for roles that were never confirmed. Employers receive profiles that were never screened. Both sides end up assuming the other is the problem.",
      points: [
        "Fees taken against vacancies that do not exist",
        "Qualifications that will not be recognised in the destination country",
        "Language requirements discovered at the final stage",
        "Permit categories that never applied to the candidate",
      ],
    },
    solution: {
      title: "Screened on Both Sides, Before Anyone Commits",
      body: "Employers get candidates who have been checked against the role's actual legal and language requirements. Candidates get a named employer, a real vacancy and a straight assessment of their chances.",
    },
    deliverables: [
      {
        title: "End-To-End Hiring",
        body: "Sourcing, screening, interviewing and offer management run as one process for the employer.",
      },
      {
        title: "White & Blue-Collar Placement",
        body: "From operational and skilled trades through to compliance-critical professional roles.",
      },
      {
        title: "Eligibility Screening",
        body: "Qualification recognition, language level and permit category checked before submission.",
      },
      {
        title: "Profile Preparation",
        body: "CVs and documentation rebuilt to the standard European employers actually read.",
      },
      {
        title: "Relocation Coordination",
        body: "Permit and arrival logistics handled alongside the placement itself.",
      },
    ],
    whoFor: [
      "European SMEs hiring beyond the local labour market",
      "Regulated firms filling compliance-critical roles",
      "Professionals seeking legitimate EU employment",
      "Skilled workers in our South Asia and Middle East corridors",
    ],
    process: [
      { step: "01", name: "Brief", body: "The employer's real requirement, including the legal constraints on it." },
      { step: "02", name: "Source", body: "Candidates drawn from our established recruitment corridors." },
      { step: "03", name: "Screen", body: "Eligibility, qualifications and language verified before shortlisting." },
      { step: "04", name: "Match", body: "Interviews coordinated, offers managed and terms agreed." },
      { step: "05", name: "Relocate", body: "Permit process and arrival handled through to the first day." },
    ],
    faqs: [
      {
        q: "Do candidates pay a fee?",
        a: "Our recruitment mandates come from employers. Any candidate-side costs are stated in writing before you commit to anything, and we will always tell you what a third party — a government, a translator, an authority — will charge separately. If a fee structure is ever unclear to you, ask us to put it in writing.",
      },
      {
        q: "Can you guarantee me a job in Europe?",
        a: "No. No recruiter can, and it is the clearest warning sign in this industry. What we can tell you is whether your profile is genuinely competitive for the roles we are mandated on — including when it is not.",
      },
      {
        q: "Will my qualifications be recognised?",
        a: "That depends on your profession and the destination country. Regulated professions such as healthcare and engineering have formal recognition procedures that take time. We check this at screening, before you invest in an application.",
      },
      {
        q: "Which countries do you place into?",
        a: "The destinations named on our Destinations page. Availability varies by role, sector and permit category at any given time — ask us about your specific profession rather than assuming from the list.",
      },
      {
        q: "Do I need to speak the local language?",
        a: "It depends entirely on the role. Some sectors and employers operate in English; many operational roles require working proficiency in the local language. We tell you the requirement for a specific vacancy upfront.",
      },
    ],
    related: ["company-formation", "investor-relocation"],
    caveat:
      "SnZ Ventures does not guarantee employment, work permits or visa outcomes. Hiring decisions rest with the employer and immigration decisions with the relevant national authority.",
  },
];

export const getService = (slug: string) =>
  services.find((s) => s.slug === slug);

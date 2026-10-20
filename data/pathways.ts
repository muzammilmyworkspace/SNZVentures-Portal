/**
 * THE THREE PATHWAYS — the spine of the whole site.
 * Every claim here maps to a service verified on the live snzventures.com.
 */

export type PathwayKey = "study" | "careers" | "business";

export type Pathway = {
  key: PathwayKey;
  eyebrow: string;
  title: string;
  href: string;
  image: string;
  imageAlt: string;
  /** The emotional hook — speaks to the reader, not about the company. */
  hook: string;
  /** What actually happens. Concrete, no fluff. */
  body: string;
  cta: string;
  bullets: string[];
  /** Accent used for the card's differentiating treatment. */
  accent: "green" | "navy" | "steel";
};

export const pathways: Pathway[] = [
  {
    key: "study",
    eyebrow: "For students",
    title: "Study Abroad",
    href: "/study-abroad",
    image: "/images/path-study.webp",
    imageAlt:
      "Students working together over a laptop in a university library",
    hook: "Turn ambition into an international education.",
    body: "Most people choose a course, then hope a career follows. We work the other way round — starting from where the jobs actually are in five years, then back to what you should study now.",
    cta: "Explore study opportunities",
    bullets: [
      "Course and subject choice mapped to real labour demand",
      "Country and institution shortlisting",
      "Where your degree can legally take you afterwards",
    ],
    accent: "green",
  },
  {
    key: "careers",
    eyebrow: "For professionals",
    title: "Global Careers",
    href: "/global-careers",
    image: "/images/path-careers.webp",
    imageAlt: "A quiet modern workspace beside a city-facing window",
    hook: "Take your career where the opportunity is.",
    body: "We recruit into European SMEs and regulated firms — white-collar and blue-collar. That means the roles are real, the employer is named, and you are told your honest eligibility before anyone takes a fee.",
    cta: "Explore career opportunities",
    bullets: [
      "Live roles with named European employers",
      "Straight answers on eligibility and work authorisation",
      "Profile and documentation preparation",
    ],
    accent: "navy",
  },
  {
    key: "business",
    eyebrow: "For founders & investors",
    title: "Business Setup",
    href: "/business-setup",
    image: "/images/path-business.webp",
    imageAlt: "Modern glass office towers viewed from below",
    hook: "Build your business where the market is.",
    body: "A Lithuanian company reaches 27 member states from day one. We handle incorporation, accounting, licensing and the residence permits that let you actually move — through one coordinator.",
    cta: "Explore business opportunities",
    bullets: [
      "UAB / MB formation, VAT, EORI and payroll",
      "EMI, PI, specialised bank and crypto licensing",
      "Residence permits and family relocation",
    ],
    accent: "steel",
  },
];

/** SECTION 3 — the problem, told per audience. Honest, specific, unsalesy. */
export const problems: {
  key: PathwayKey;
  audience: string;
  headline: string;
  points: { title: string; body: string }[];
}[] = [
  {
    key: "study",
    audience: "Students",
    headline: "The information is free. Knowing which of it applies to you isn't.",
    points: [
      {
        title: "Every ranking says something different",
        body: "League tables measure research output. You need a course that leads to work you can actually get.",
      },
      {
        title: "Scholarships exist — finding the right ones is the work",
        body: "Most are country, subject or nationality specific, and the deadlines sit months before the intake.",
      },
      {
        title: "The route after graduation is the part nobody checks",
        body: "Post-study work rights differ sharply by country. It is the single most expensive thing to get wrong.",
      },
    ],
  },
  {
    key: "careers",
    audience: "Professionals",
    headline: "The hardest part isn't the job. It's telling real from fake.",
    points: [
      {
        title: "Agents who charge for hope",
        body: "Upfront fees for a role that was never confirmed is the oldest pattern in this industry.",
      },
      {
        title: "Eligibility is decided before you apply",
        body: "Qualification recognition, language level and permit category rule most people in or out early.",
      },
      {
        title: "A CV that works at home may not travel",
        body: "European employers read structure, evidence and gaps differently to the market you trained in.",
      },
    ],
  },
  {
    key: "business",
    audience: "Founders",
    headline: "Registering a company is easy. Operating one is the actual work.",
    points: [
      {
        title: "Formation is day one, not the finish line",
        body: "Bank account, VAT, accounting, payroll and reporting are what determine whether the entity functions.",
      },
      {
        title: "Licensing runs on evidence, not intentions",
        body: "EMI and PI applications turn on capital, governance and named compliance officers — not the business plan.",
      },
      {
        title: "The company and the visa are separate problems",
        body: "Owning an EU entity does not by itself give you the right to live there. They are two processes.",
      },
    ],
  },
];

/** SECTION 4 — the SNZ approach. Six steps, deliberately unglamorous. */
export const approach = [
  {
    step: "01",
    name: "Discover",
    body: "A conversation about where you want to end up — not a pitch about what we sell.",
  },
  {
    step: "02",
    name: "Assess",
    body: "Your honest eligibility. Qualifications, capital, experience, timing. Including when the answer is no.",
  },
  {
    step: "03",
    name: "Plan",
    body: "One route, written down. Cost, sequence, documents, and who is responsible for each part.",
  },
  {
    step: "04",
    name: "Prepare",
    body: "Files, profiles, applications and filings built to the standard the receiving side expects.",
  },
  {
    step: "05",
    name: "Connect",
    body: "Introductions to the employer, institution, bank, or licensed partner firm that handles the regulated step.",
  },
  {
    step: "06",
    name: "Move forward",
    body: "Arrival, registration and the first months of operating — the stretch most advisors stop short of.",
  },
] as const;

/**
 * SNZ VENTURES — SINGLE SOURCE OF TRUTH FOR COMPANY FACTS
 * ---------------------------------------------------------------------------
 * Every factual claim rendered on this website reads from this file.
 *
 * SOURCING RULES (do not break these):
 *  - `verified: true`  → confirmed on the live snzventures.com site.
 *  - `verified: false` → appears on the live site but NOT independently
 *                        confirmed. Client must sign off before launch.
 *  - Anything unknown is typed as `null` and rendered as a visible
 *    [CONTENT REQUIRED] marker — never silently invented.
 *
 * Nothing in this file was authored speculatively. See CONTENT-HANDOFF.md.
 */

export const company = {
  name: "SnZ Ventures",
  nameUpper: "SNZ VENTURES",
  /** Verified — live site header positioning line. */
  positioning: "European Gateway for Business, Fintech & Talent",
  /** Verified — live site mission statement. */
  missionQuote:
    "Geography should not be a barrier to ambition. SnZ Ventures dismantles the borders between European opportunity.",

  /** Verified — published on the live site. */
  contact: {
    phone: "+370 603 05146",
    phoneHref: "+37060305146",
    email: "info@snzventures.com",
    /**
     * Where consultation enquiries are delivered.
     *
     * ⚠ DIFFERENT DOMAIN, ON PURPOSE — client-specified. General contact
     * remains info@snzventures.com (above); the consultation form goes here.
     * `MAIL_TO` overrides this at runtime without a code change, so if this
     * address is ever wrong it can be corrected from the environment.
     *
     * See CONTENT-HANDOFF § 2 — this one needs confirming before launch.
     */
    consultationEmail: "info@maincharacter.nl",
    /** Live site links a WhatsApp channel on the same published number. */
    whatsapp: "37060305146",
    city: "Vilnius",
    country: "Lithuania",
    countryCode: "LT",
    /** Client-supplied — office address. */
    streetAddress: "T. Ševčenkos g. 16",
    postalCode: "03223",
  },

  /** [CONTENT REQUIRED] — legal entity details not published. */
  legal: {
    registeredName: null as string | null,
    companyCode: null as string | null,
    vatNumber: null as string | null,
    incorporatedIn: "Lithuania",
  },

  /** Client-supplied profiles. Only X/Twitter is outstanding. */
  social: {
    linkedin: "https://www.linkedin.com/company/snz-ventures/",
    /**
     * Client-supplied Google Business share link. Used for "read all reviews"
     * and "leave a review", and as the fallback destination when the Places
     * API is not configured — so the link works with no credentials at all.
     * Review CONTENT is fetched separately; see lib/reviews.ts.
     */
    googleReviews: "https://share.google/MNo5ThKseoiGnDEnF",

    /**
     * Social profiles, supplied by the client. The footer renders an icon for
     * each entry that has a URL; anything left `null` renders dimmed and
     * non-clickable rather than as a dead link.
     */
    instagram: "https://www.instagram.com/snz.ventures/?hl=en",
    facebook: "https://www.facebook.com/snz.ventures/",
    tiktok: "https://www.tiktok.com/@snz.ventures",
    youtube: "https://www.youtube.com/channel/UC5lkD3z9vbxCPgI5f3R1tzA",
    /** No X/Twitter profile supplied. */
    x: null as string | null,
  },

  /** Verified — stated on the live site. */
  attributes: ["Woman-Owned Enterprise", "Vilnius, Lithuania", "EU / EEA Reach"],

  /**
   * Regulatory posture — stated plainly on the live site.
   * This is a TRUST asset, not a liability. Never imply direct regulation.
   */
  regulatoryNotice:
    "SnZ Ventures is an advisory firm. Regulated activities — audit, legal representation, licensing submissions and AML officer functions — are delivered through licensed partner firms. SnZ Ventures is not itself a regulated financial institution.",

  /*
    THE APEX, NOT www.

    This was `https://www.snzventures.com`, and that hostname does not serve
    this site. It resolves to different hosting whose TLS certificate is for
    another name, so a browser opening it gets a full-page security warning
    before it renders anything.

    That address was not just a link — SITE_URL is built from it, so every
    canonical tag, every og:url and every entry in the sitemap on the live site
    pointed at a hostname that fails to connect. Told that the canonical version
    of a page is a URL it cannot fetch, a search engine has no reason to index
    the one that works.

    The apex is what is attached to the deployment and what answers 200, so it
    is what the site should call itself. If `www` is added later, point it at
    the apex with a redirect rather than moving this back.
  */
  siteUrl: "https://snzventures.com",
  locale: "en",
} as const;

/**
 * HEADLINE STATISTICS
 * ---------------------------------------------------------------------------
 * ⚠ These four figures are published on the client's own live website but have
 * NOT been independently audited. They are the ONLY numbers on this site.
 * If the client cannot substantiate one, set `verified: false` → it is
 * automatically withheld from render (see components/sections/Proof.tsx).
 */
export const stats = [
  {
    value: 400,
    suffix: "+",
    label: "Entities formed",
    detail: "Companies incorporated and made operational through our process.",
    verified: false,
  },
  {
    value: 12,
    suffix: "",
    label: "Talent source hubs",
    detail: "Recruitment corridors across South Asia and the Middle East.",
    verified: false,
  },
  {
    value: 27,
    suffix: "",
    label: "EU member states",
    detail: "The single market your Lithuanian entity can operate across.",
    verified: true, // Objective fact about the EU, not a company claim.
  },
  {
    value: 48,
    suffix: "h",
    label: "Registration window",
    detail: "Typical Lithuanian company registration turnaround.",
    verified: false,
  },
] as const;

/**
 * QUALITATIVE TRUST POINTS
 * Used wherever statistics are unavailable or unverified. These make no
 * numeric claim and are safe to render unconditionally.
 */
export const trustPoints = [
  {
    title: "One Coordinator, Not Six Vendors",
    body: "Formation, accounting, licensing and hiring run through a single point of contact instead of four disconnected firms.",
  },
  {
    title: "Licensed Partners, Named Upfront",
    body: "You know which regulated firm handles your audit, your legal filings and your compliance function before you commit.",
  },
  {
    title: "We Tell You When the Answer Is No",
    body: "If a market, a licence or a route doesn't fit your case, you hear it in the first conversation — not after the invoice.",
  },
  {
    title: "Built on Both Sides of the Corridor",
    body: "We work where the talent and founders come from, and where they're going. That's the whole point of the firm.",
  },
] as const;

/**
 * ECOSYSTEM CONTEXT — ⚠ HANDLE WITH CARE
 * ---------------------------------------------------------------------------
 * These institutions are listed on the client's live site. They are rendered
 * strictly as ECOSYSTEM CONTEXT ("we operate within"), never as partners,
 * endorsements or accreditations. Do not relabel this section without written
 * confirmation from each named body.
 */
export const ecosystem = [
  "Bank of Lithuania",
  "Invest Lithuania",
  "Vilnius Tech Park",
  "Startup Lithuania",
  "Enterprise Europe Network",
  "EU Blue Card Network",
] as const;

export const ecosystemDisclaimer =
  "Institutions shown describe the regulatory and business environment SnZ Ventures operates within. They do not constitute endorsement, accreditation or partnership.";

/** Verified — corridors named on the live site. */
export const sourceMarkets = [
  "India",
  "Pakistan",
  "Bangladesh",
  "Nepal",
  "UAE",
  "Saudi Arabia",
  "Egypt",
  "Jordan",
] as const;

/**
 * TESTIMONIALS — deliberately empty.
 * No client testimonials are published anywhere. Fabricating them is out of
 * the question, so the Stories section renders its honest "no proof yet"
 * state instead. Populate this array and the section switches automatically.
 */
export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  pathway: "study" | "careers" | "business";
  image?: string;
};

export const testimonials: Testimonial[] = [];

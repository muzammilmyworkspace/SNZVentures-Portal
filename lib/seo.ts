import type { Metadata } from "next";
import { company } from "@/data/company";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? company.siteUrl;

const DEFAULT_DESCRIPTION =
  "SnZ Ventures is a Vilnius-based advisory firm helping students, professionals and founders move into Europe — company formation, fintech licensing, international recruitment and investor relocation.";

type PageSeo = {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  noIndex?: boolean;
};

/** Builds a complete, canonicalised metadata object for a route. */
export function buildMetadata({
  title,
  description,
  path,
  image,
  type = "website",
  publishedTime,
  noIndex,
}: PageSeo): Metadata {
  const url = `${SITE_URL}${path === "/" ? "" : path}`;
  const ogImage = image ?? "/opengraph-image";

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      url,
      siteName: company.name,
      locale: "en_GB",
      type,
      ...(publishedTime ? { publishedTime } : {}),
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/* ---------------------------------------------------------------------------
   STRUCTURED DATA
   Only describes content that is genuinely visible on the page. No invented
   ratings, review counts, prices or awards.
   --------------------------------------------------------------------------- */

export function organizationSchema() {
  const sameAs = Object.values(company.social).filter(Boolean) as string[];
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${SITE_URL}/#organization`,
    name: company.name,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    email: company.contact.email,
    telephone: company.contact.phone,
    address: {
      "@type": "PostalAddress",
      addressLocality: company.contact.city,
      addressCountry: company.contact.countryCode,
      ...(company.contact.streetAddress
        ? { streetAddress: company.contact.streetAddress }
        : {}),
      ...(company.contact.postalCode
        ? { postalCode: company.contact.postalCode }
        : {}),
    },
    ...(sameAs.length ? { sameAs } : {}),
    areaServed: { "@type": "Place", name: "European Union" },
    knowsLanguage: ["en"],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: company.name,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en",
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === "/" ? "" : item.path}`,
    })),
  };
}

export function serviceSchema(s: {
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    description: s.description,
    url: `${SITE_URL}${s.path}`,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed: { "@type": "Place", name: "European Union" },
  };
}

/** Only emit for FAQs actually rendered on the page. */
export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function articleSchema(a: {
  title: string;
  description: string;
  path: string;
  published: string;
  image: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    url: `${SITE_URL}${a.path}`,
    datePublished: a.published,
    dateModified: a.published,
    image: `${SITE_URL}${a.image}`,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export { DEFAULT_DESCRIPTION };

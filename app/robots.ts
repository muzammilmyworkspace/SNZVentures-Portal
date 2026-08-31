import type { MetadataRoute } from "next";

/**
 * NOTHING ON THIS HOST IS FOR CRAWLERS.
 *
 * Every route here is an authenticated workspace or the door to one. The
 * marketing origin keeps its own robots.txt with a real allow list and a
 * sitemap; this one exists so that file is not inherited by a host where it
 * would be wrong.
 *
 * The root layout also sets `robots: { index: false, follow: false }`. Both
 * are deliberate: a crawler blocked here cannot read the meta tag, and a
 * crawler that reaches a page some other way still finds the tag. Belt and
 * braces, because the cost of getting this wrong is a client's sign-in page —
 * or worse, a document URL — turning up in a search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}

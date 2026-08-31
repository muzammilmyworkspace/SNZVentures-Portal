import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * ROOT LAYOUT — PORTAL ORIGIN.
 *
 * This deployment serves the client portal and nothing else, so it carries no
 * marketing furniture: no site header, no footer, no floating CTA, no pathway
 * popup. The portal draws its own shell (`PortalShell`) and the auth screens
 * draw theirs (`AuthShell`), which is why the body here is only the skip link
 * and the page.
 *
 * It also emits no Organization / WebSite structured data. That schema
 * describes the public business and belongs on the marketing origin; repeating
 * it on a noindex sign-in host would be duplicate markup describing a site
 * that is not this one.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * NOINDEX AT THE ROOT, not page by page.
 *
 * Every route on this host is either an authenticated workspace or the door to
 * one. None of it should ever appear in a search result, and setting it here
 * means a page added later is private by default rather than private only if
 * somebody remembered.
 */
export const metadata: Metadata = {
  title: {
    default: "SnZ Ventures — Client Portal",
    template: "%s | SnZ Ventures",
  },
  description: "Sign in to your SnZ Ventures client portal.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#FAFBFD",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/*
          Theme, applied BEFORE first paint. This has to be a blocking inline
          script: setting it from an effect would paint the server's markup and
          repaint on hydration, and with two palettes this far apart that flash
          is a full inversion of the page. `suppressHydrationWarning` on <html>
          is required because this mutates the element before React sees it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('snz-theme');if(t!=='light'&&t!=='dark')t='light';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
        {/*
          Reveal animations render as inline opacity:0 in the SSR HTML and are
          cleared on hydration. If scripting is unavailable, restore them so no
          content is ever invisible.
        */}
        <noscript>
          <style>{`[style*="opacity:0"],[style*="opacity: 0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      {/*
        `suppressHydrationWarning` because extensions mutate <body> before React
        hydrates — Grammarly is the usual culprit. This suppresses attribute
        diffing on this element ONLY; children are still checked normally.
      */}
      <body className="tone-deep min-h-screen antialiased" suppressHydrationWarning>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

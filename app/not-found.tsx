import Link from "next/link";
import { Container } from "@/components/ui/Primitives";

/**
 * 404 for the PORTAL origin.
 *
 * The marketing version of this page offered the public nav — Study Abroad,
 * Global Careers and so on — which are pages that do not exist on this host.
 * Suggesting them here would send someone who is already lost to a second
 * dead end on a different domain.
 *
 * The only useful destinations from a portal 404 are the portal itself and
 * the way back in, so those are what it offers.
 */
const SUGGESTED = [
  { href: "/portal", label: "Your dashboard" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/messages", label: "Messages" },
  { href: "/login", label: "Sign in" },
];

export default function NotFound() {
  return (
    <section className="grain relative flex min-h-[76vh] items-center overflow-hidden bg-surface pt-24 text-fg">
      <div aria-hidden className="graticule mask-radial absolute inset-0 opacity-55" />
      <div
        aria-hidden
        className="bloom-moss pointer-events-none absolute -bottom-32 left-1/3 h-96 w-96 opacity-30"
      />
      <Container className="relative py-16">
        <div className="max-w-2xl">
          <p className="label text-accent">404</p>
          <h1 className="d-1 mt-4 text-fg">This page doesn&rsquo;t exist.</h1>
          <p className="lede mt-4 text-muted">
            The page you were looking for has moved or was never here. If you
            were signed in, your dashboard is still where you left it.
          </p>

          <nav aria-label="Suggested pages" className="mt-8">
            <ul className="flex flex-wrap gap-2">
              {SUGGESTED.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="inline-flex rounded-[var(--radius-sm)] border border-line px-3.5 py-2 text-[0.85rem] text-muted transition-colors hover:border-line hover:text-fg"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </section>
  );
}

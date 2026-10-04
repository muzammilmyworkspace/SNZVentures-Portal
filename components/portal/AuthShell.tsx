import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { company } from "@/data/company";
import { AuthSky, AuthPass } from "./AuthScene";

/**
 * Shared frame for login / register / password screens.
 *
 * Split composition: brand and reassurance on the left, the form on the right.
 * It reads as a continuation of the public site — same palette, same type —
 * so signing in doesn't feel like leaving the brand.
 *
 * THE LEFT PANEL IS A GRADIENT, NOT A PHOTOGRAPH.
 * It used to be a night shot of Vilnius at full bleed, which rendered as a
 * near-black rectangle: the type sat on it legibly enough, but the panel
 * carried no brand colour at all and read as an empty dark box. The ground is
 * now the logo's own blue→teal→green ramp with the city underneath at low
 * opacity, so the photograph gives texture and depth while the COLOUR comes
 * from the brand.
 *
 * NO DIVIDER RULES. The previous version separated the standfirst from the
 * list with a horizontal border and joined phrases with em dashes and a
 * middot. Spacing does that job here — a rule across a short column chops it
 * into two unrelated blocks rather than grouping it.
 */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="tone-deep relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/*
        BOARDING PASS (2026-10-04). The brand panel is now the website's night
        sky: chart grid, arcs drawing themselves, drifting waves, and a boarding
        pass stepping through the portal's real stages. Solid night colour as
        the element's own background, so contrast tools and forced-colors modes
        see a dark ground under the white type (see the note that used to be
        here about gradients with no background-color).
      */}
      <aside className="relative hidden overflow-hidden bg-[#070B1A] lg:flex lg:flex-col lg:justify-between lg:p-14">
        <AuthSky />
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(61,113,201,0.28),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-32 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(114,196,60,0.16),transparent)]" />

        <Link href="/" className="relative z-[4] inline-flex items-center gap-3">
          <Image
            src="/brand/snz-mark.png"
            alt=""
            width={44}
            height={44}
            className="no-grade h-11 w-11 rounded-full ring-1 ring-white/20"
          />
          <span className="font-[family-name:var(--font-display)] text-[1.35rem] font-semibold tracking-[-0.02em] text-white">
            SnZ Ventures
          </span>
          <span className="ml-1 rounded-full border border-white/20 px-2.5 py-1 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[#A9C9FA]">
            Portal
          </span>
        </Link>

        <div className="relative z-[4]">
          <p className="flex items-center gap-3 font-mono text-[0.75rem] uppercase tracking-[0.18em] text-[#6FA6F7]">
            <span className="h-px w-8 bg-current" /> Your student portal
          </p>
          <p className="mt-5 max-w-xl font-[family-name:var(--font-display)] text-[clamp(2.4rem,3.6vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-white">
            One boarding pass for <span className="text-[#72C43C]">the whole journey.</span>
          </p>
          <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-[#C9D2E3]">
            Every document, every application and every next step, held by the same people you actually speak to.
          </p>
          <div className="mt-10">
            <AuthPass />
          </div>
        </div>

        <p className="relative z-[4] font-mono text-[0.75rem] uppercase tracking-[0.16em] text-[#A9B3C9]">
          {company.contact.city}, {company.contact.country} · VNO
        </p>
      </aside>

      {/* Form panel */}
      <main id="main" className="flex flex-col justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/*
            A WAY BACK OUT, at every width.

            The brand mark on the left panel is a link home, but that panel is
            hidden below `lg` — so on a phone the sign-in screen was a dead end
            with no route back to the site. Someone who clicked Login by mistake
            had only the browser's Back button.

            The mark stays as the mobile masthead; this is the explicit exit,
            and it is shown on desktop too because "click the logo" is a
            convention people should not have to already know.
          */}
          <div className="mb-8 flex items-center justify-between gap-4">
            {/* py/-my: the mark is 40px, leaving the link 4px short of the
                44px target minimum, without moving the masthead. */}
            <Link href="/" className="inline-flex items-center gap-3 py-0.5 -my-0.5 lg:hidden">
              <Image
                src="/brand/snz-mark.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-full"
              />
              <span className="text-[1.15rem] font-bold tracking-[-0.02em] text-fg">
                SnZ Ventures
              </span>
            </Link>

            {/*
              "Back to home" removed when the portal moved to its own origin.
              It pointed at "/", which on this host is the portal root, not the
              marketing site — so the one thing its label promised was the one
              thing it could not do. Sending it to snzventures.com instead would
              be worse: a link off the application, in the masthead of a
              sign-in screen, is exactly where it should not be.
            */}
          </div>

          <p className="flex items-center gap-3 font-mono text-[0.75rem] uppercase tracking-[0.18em] text-accent">
            <span className="h-px w-8 bg-current" /> Check in
          </p>
          <h1 className="d-1 mt-4 text-fg-strong">{title}</h1>
          <p className="mt-4 text-[1.05rem] leading-relaxed text-muted">{lead}</p>

          <div className="mt-9">{children}</div>

          {footer && <div className="mt-9">{footer}</div>}

          <p className="mt-10 text-[0.8rem] leading-relaxed text-faint">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline underline-offset-2 hover:text-muted">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy-policy" className="underline underline-offset-2 hover:text-muted">
              Privacy Policy
            </Link>
            . We never share your documents outside your case.
          </p>
        </div>
      </main>
    </div>
  );
}

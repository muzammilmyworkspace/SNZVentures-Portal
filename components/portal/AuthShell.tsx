import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { company } from "@/data/company";

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
    <div className="tone-deep grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      {/*
        The gradient is the ELEMENT'S OWN background, not an overlay div.

        It was briefly a sibling `<div class="absolute inset-0">` sitting above
        a photograph, which looked right but left the <aside> itself with no
        background at all. Anything resolving the effective background by
        walking up the ancestor chain — the contrast audit, forced-colors
        modes, a text-only reader — saw the page ground instead and measured
        white-on-white. Painting it here means the panel genuinely has this
        background rather than appearing to.
      */}
      <aside
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14"
        style={{
          /*
            A SOLID COLOUR AS WELL AS THE GRADIENT, on purpose.

            A gradient is a background-IMAGE. With no background-color behind
            it, anything that cannot paint the image — a forced-colors mode, a
            printed page, an old engine, or a tool measuring contrast — falls
            through to whatever is underneath, which here is the light page
            ground. That is how white text ends up on a white background.

            This value is sampled from the middle of the ramp, so the fallback
            is representative rather than merely dark.
          */
          backgroundColor: "#0F3257",
          backgroundImage:
            "radial-gradient(120% 90% at 15% 15%, rgba(255,255,255,0.12) 0%, transparent 55%), radial-gradient(90% 70% at 85% 95%, rgba(114,196,60,0.28) 0%, transparent 60%), linear-gradient(150deg, #08152F 0%, #0F3257 38%, #155A5C 68%, #236437 100%)",
        }}
      >
        {/*
          The photograph is texture, not subject — held well back so the brand
          colour beneath stays the thing you actually see.
        */}
        <Image
          src="/images/study-campus.webp"
          alt=""
          fill
          priority
          sizes="55vw"
          className="object-cover opacity-[0.30] mix-blend-soft-light"
        />
        <div
          aria-hidden
          className="graticule pointer-events-none absolute inset-0 z-[3] opacity-[0.22]"
        />

        <Link href="/" className="relative z-[4] inline-flex items-center gap-3">
          <Image
            src="/brand/snz-mark.png"
            alt=""
            width={44}
            height={44}
            className="no-grade h-11 w-11 rounded-full ring-1 ring-white/20"
          />
          <span className="text-[1.35rem] font-bold tracking-[-0.02em] text-white">
            SnZ Ventures
          </span>
        </Link>

        <div className="relative z-[4] max-w-xl">
          {/*
            Set in capitals with open tracking — at this size lowercase read as
            a sentence someone had typed, where the brand wants a statement.
            `d-1`, not `d-2`: it is the panel's only headline and was sitting at
            the same size as the form heading opposite it.
          */}
          <p className="d-1 uppercase tracking-[-0.01em] text-white">
            One Place For
            <br />
            The Whole Journey.
          </p>
          <p className="mt-6 max-w-lg text-[1.15rem] leading-relaxed ink-on-photo">
            Every document, every application, every honest next step — held by
            the same people you actually speak to.
          </p>
          <ul className="mt-10 space-y-4">
            {[
              "Every document you send us, in one place",
              "The next step, always named",
              "Your advisor, one message away",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3.5 text-[1rem] leading-relaxed ink-on-photo"
              >
                <span
                  aria-hidden
                  className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-moss-300"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-[4] text-[0.85rem] ink-on-photo-soft">
          {company.contact.city}, {company.contact.country}
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

            <Link
              href="/"
              className="label group ml-auto inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-line px-4 text-muted transition-colors hover:border-moss-400/60 hover:text-accent"
            >
              <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-2.5 w-2.5 transition-transform duration-300 group-hover:-translate-x-0.5">
                <path d="M11 6H2m0 0l3.5-3.5M2 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to home
            </Link>
          </div>

          <h1 className="d-1 text-fg-strong">{title}</h1>
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

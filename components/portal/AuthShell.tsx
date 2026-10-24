import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AfterMount } from "./AfterMount";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { company } from "@/data/company";

/**
 * Shared frame for login / register / password screens.
 *
 * SNZ SPLIT (2026-10-24). Left: a navy brand panel that says what the portal
 * is for, as the four steps a student actually takes (details, application
 * with consent, documents, messages), with the office contacts underneath.
 * Right: the form on the page ground, with the theme switch. On a phone the
 * panel shrinks to a short header above the form. Styles live in
 * app/portal-clean.css under `.snza`; the panel stays navy in both themes.
 */
const STEPS = [
  { title: "Your details", body: "Photo, phone and where you live." },
  { title: "Application form", body: "Filled in once, sent with your signed consent." },
  { title: "Documents", body: "A checklist of what to upload, kept private to your case." },
  { title: "Messages", body: "Ask the SnZ team anything, in one thread." },
];

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
    <div className="snza tone-soft relative isolate grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ------------------------------------------------ brand panel */}
      <aside className="snza-panel relative overflow-hidden px-6 pb-8 pt-7 sm:px-10 lg:px-14 lg:py-12">
        <Image
          src="/images/study-campus.webp"
          alt=""
          fill
          priority
          sizes="(min-width:1024px) 52vw, 100vw"
          className="snza-photo no-grade object-cover"
        />
        <div aria-hidden className="snza-veil" />
        <div aria-hidden className="snza-dots" />

        <div className="relative flex h-full flex-col">
          <Link href="/" className="flex w-fit items-center gap-3">
            <Image src="/brand/snz-mark.png" alt="" width={44} height={44} className="no-grade h-11 w-11 rounded-full bg-white" />
            <span className="flex flex-col leading-none">
              <span className="text-[1.15rem] font-bold tracking-[-0.02em] text-white">SnZ Ventures</span>
              <span className="mt-1 text-[0.78rem] font-medium text-[#B9C3DE]">Client portal</span>
            </span>
          </Link>

          <div className="snza-rise mt-8 max-w-[34rem] lg:mt-auto">
            <p className="snza-eyebrow">Study in Europe</p>
            <h2 className="mt-4 text-[1.9rem] font-bold leading-[1.05] tracking-[-0.035em] text-white sm:text-[2.4rem] lg:text-[3.1rem]">
              Your whole application, <span className="text-[#8FD65F]">in one place.</span>
            </h2>
            <p className="mt-4 hidden max-w-[30rem] text-[1rem] leading-relaxed text-[#C9CFE3] sm:block">
              Follow your file with SnZ Ventures: your details, your application, your documents and every
              message with our team.
            </p>
          </div>

          <ol className="snza-steps mt-9 hidden max-w-[30rem] lg:grid">
            {STEPS.map((s, i) => (
              <li key={s.title} className="snza-step" style={{ animationDelay: `${0.25 + i * 0.1}s` }}>
                <span className="snza-step-n">{i + 1}</span>
                <span>
                  <b>{s.title}</b>
                  <span>{s.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-auto hidden pt-10 text-[0.85rem] text-[#B9C3DE] lg:block">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <a href={`tel:${company.contact.phoneHref}`} className="hover:text-white">
                {company.contact.phone}
              </a>
              <a href={`mailto:${company.contact.email}`} className="hover:text-white">
                {company.contact.email}
              </a>
            </div>
            <p className="mt-2 text-[#8F9AC0]">
              {company.contact.streetAddress}, {company.contact.postalCode} {company.contact.city}, {company.contact.country}
            </p>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------ form */}
      <div className="relative flex flex-col px-5 py-8 sm:px-10 lg:py-10">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>

        <main id="main" className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-8">
          <h1 className="text-[1.85rem] font-bold leading-tight tracking-[-0.03em] text-fg-strong">{title}</h1>
          <p className="mt-2 text-[0.98rem] leading-relaxed text-muted">{lead}</p>

          <div className="snza-card mt-7 px-5 py-6 sm:px-7 sm:py-7">
            <AfterMount
              fallback={
                <div aria-hidden className="space-y-5">
                  <div className="h-[74px] rounded-[10px] bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]" />
                  <div className="h-[74px] rounded-[10px] bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]" />
                  <div className="h-12 w-full rounded-[8px] bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" />
                </div>
              }
            >
              {children}
            </AfterMount>

            {footer && <div className="mt-6 border-t border-line pt-5 text-center">{footer}</div>}
          </div>

          <p className="mt-6 text-center text-[0.78rem] leading-relaxed text-faint">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline underline-offset-2 hover:text-muted">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy-policy" className="underline underline-offset-2 hover:text-muted">
              Privacy Policy
            </Link>
            .
          </p>
        </main>
      </div>
    </div>
  );
}

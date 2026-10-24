import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AfterMount } from "./AfterMount";

/**
 * Shared frame for login / register / password screens.
 *
 * SNZ CLEAN (2026-10-24). One centred card on a quiet ground: the logo above,
 * the form inside, three short reassurances below. No split panel, no
 * animated sky, nothing to read before the form. Styles live in
 * app/portal-clean.css under `.snza`; dark is the default theme.
 */
const POINTS = [
  "Your documents stay private to your case",
  "Every step of your application in one place",
  "Message your adviser directly",
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
    <div className="snza tone-soft relative isolate flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:py-14">
      <main id="main" className="w-full max-w-[440px]">
        <Link href="/" className="mx-auto mb-7 flex w-fit items-center gap-3">
          <Image src="/brand/snz-mark.png" alt="" width={44} height={44} className="no-grade h-11 w-11 rounded-full" />
          <span className="flex flex-col leading-none">
            <span className="text-[1.2rem] font-bold tracking-[-0.02em] text-fg-strong">SnZ Ventures</span>
            <span className="mt-1 text-[0.8rem] font-medium text-muted">Client portal</span>
          </span>
        </Link>

        <div className="snza-card px-6 py-7 sm:px-8 sm:py-8">
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-fg-strong">{title}</h1>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{lead}</p>

          <div className="mt-7">
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
          </div>

          {footer && <div className="mt-7 border-t border-line pt-5 text-center">{footer}</div>}
        </div>

        <ul className="mt-6 space-y-2 px-2">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-[0.85rem] text-muted">
              <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0 text-accent">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {p}
            </li>
          ))}
        </ul>

        <p className="mt-6 px-2 text-[0.78rem] leading-relaxed text-faint">
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
  );
}

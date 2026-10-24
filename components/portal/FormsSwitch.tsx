"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useReduced } from "./useReduced";

/**
 * The two forms a student meets, under one menu item (Setup › Forms): the
 * application they fill and the consent they sign before submitting it. Shown
 * above both pages by app/portal/admin/forms/layout.tsx.
 */
const FORMS = [
  {
    href: "/portal/admin/forms/application",
    label: "Application form",
    note: "The questions every student answers",
    icon: "M4 2.5h6l3 3V13.5H4zM10 2.5v3h3M6.5 8h4M6.5 10.5h4",
    superOnly: true,
  },
  {
    href: "/portal/admin/forms/consent",
    label: "Consent form",
    note: "What they sign before they submit",
    icon: "M3 11.5l2.5-.5 6.5-6.5-2-2L3.5 9zM9 3.5l2 2M2.5 14h11",
    superOnly: false,
  },
];

export function FormsSwitch({ canEditApplication }: { canEditApplication: boolean }) {
  const pathname = usePathname();
  const reduce = useReduced();
  const items = FORMS.filter((f) => canEditApplication || !f.superOnly);
  return (
    <nav aria-label="Forms" className="mb-7 grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
      {items.map((f) => {
        const on = pathname === f.href || pathname.startsWith(`${f.href}/`);
        return (
          <Link
            key={f.href}
            href={f.href}
            aria-current={on ? "page" : undefined}
            className={cn("pv4-switch relative flex items-center gap-3.5 rounded-[14px] p-4", on && "is-on")}
          >
            {on && (
              <motion.span
                layoutId="pv4-forms-switch"
                aria-hidden
                className="pv4-switch-bg absolute inset-0 -z-10 rounded-[14px]"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
              />
            )}
            <span className="pv4-switch-icon">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-[18px] w-[18px]">
                <path d={f.icon} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[0.95rem] font-semibold text-fg-strong">{f.label}</span>
              <span className="block truncate text-[0.8rem] text-muted">{f.note}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

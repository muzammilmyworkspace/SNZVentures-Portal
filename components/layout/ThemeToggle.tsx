"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * THEME SWITCH
 * ---------------------------------------------------------------------------
 * Dark is the designed default; light is an opt-in stamped as
 * `data-theme="light"` on <html> and remembered in localStorage.
 *
 * The initial value is applied by a blocking inline script in app/layout.tsx,
 * NOT here. If this component set it on mount, every light-mode visitor would
 * see a dark page repaint to light after hydration — the flash-of-wrong-theme.
 * By the time React runs, the attribute is already correct and this only has
 * to read it.
 *
 * `mounted` guards the icon, not the button. Rendering the sun on the server
 * and the moon on the client is a hydration mismatch, so the button ships in
 * the markup at full size (no layout shift) and the icon appears once the
 * client knows which theme is actually active.
 */

type Theme = "dark" | "light";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    // Keep the browser UI (address bar, form controls) in step with the page.
    document.documentElement.style.colorScheme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#FAFBFD" : "#0A1730");
    try {
      localStorage.setItem("snz-theme", next);
    } catch {
      // Private browsing can refuse storage. The toggle still works for this
      // page view; it simply will not be remembered.
    }
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        mounted
          ? `Switch to ${isLight ? "dark" : "light"} theme`
          : "Switch colour theme"
      }
      aria-pressed={mounted ? isLight : undefined}
      title={mounted ? `Switch to ${isLight ? "dark" : "light"} theme` : undefined}
      className={cn(
        // 44px for WCAG 2.5.5, matching the menu button beside it.
        "group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-line text-fg transition-colors duration-400 hover:border-moss-400/70 hover:text-accent",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block transition-opacity duration-300",
          mounted ? "opacity-100" : "opacity-0"
        )}
      >
        {isLight ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

/** Shown in dark mode: press for light. */
function SunIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="h-[1.05rem] w-[1.05rem]"
    >
      <circle
        cx="10"
        cy="10"
        r="3.4"
        stroke="currentColor"
        strokeWidth="1.4"
        className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-110"
      />
      <g
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        className="origin-center transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:rotate-45"
      >
        <path d="M10 1.8v2.1M10 16.1v2.1M18.2 10h-2.1M3.9 10H1.8" />
        <path d="M15.8 4.2l-1.5 1.5M5.7 14.3l-1.5 1.5M15.8 15.8l-1.5-1.5M5.7 5.7L4.2 4.2" />
      </g>
    </svg>
  );
}

/** Shown in light mode: press for dark. */
function MoonIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="h-[1.05rem] w-[1.05rem]"
    >
      <path
        d="M16.4 12.4A6.9 6.9 0 017.6 3.6a6.9 6.9 0 108.8 8.8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        className="transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-rotate-12"
      />
    </svg>
  );
}

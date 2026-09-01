"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Action } from "@/components/ui/Editorial";
import { analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------- shared bits */

/**
 * `text-danger` was chosen when the site was dark by default. Light is now the
 * default, and pale red on a pink tint measured barely above the background —
 * the one message a visitor most needs to read was the least legible thing on
 * the page. The colour is now picked per theme, dark enough on light grounds
 * and light enough on dark ones.
 */
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-[var(--radius-sm)] border border-red-500/45 bg-red-500/10 px-4 py-3 text-[0.9rem] font-medium leading-relaxed text-danger"
    >
      {children}
    </p>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-[18px] w-[18px]">
      <path
        d="M1.7 10S4.6 4.8 10 4.8 18.3 10 18.3 10 15.4 15.2 10 15.2 1.7 10 1.7 10z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      {/* The stroke through it is what says "hidden" — an eye alone is ambiguous
          about whether it shows the state or the action. */}
      {!open && <path d="M3.5 3.5l13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
}) {
  /*
    Reveal control for password fields.

    Typing a long password blind is where most sign-in failures actually come
    from, and on a phone it is worse. The button reports STATE through
    aria-pressed rather than swapping its label, so a screen reader hears
    "show password, pressed" instead of a name that changes under it.
  */
  const isPassword = type === "password";
  const [reveal, setReveal] = useState(false);
  const inputType = isPassword && reveal ? "text" : type;

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className={cn(isPassword && "relative")}>
      <input
        id={id}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn("field", isPassword && "pr-12")}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label="Show password"
          aria-pressed={reveal}
          aria-controls={id}
          // h-11 w-11 for the 44px target minimum. The field is 48px tall, so
          // the larger hit area still sits inside it.
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-faint transition-colors hover:text-fg"
        >
          <EyeIcon open={reveal} />
        </button>
      )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.75rem] text-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8rem] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A POST that cannot hang forever.
 *
 * `fetch` has no default timeout, so a request that stalls leaves the button
 * reading "Signing in…" indefinitely with nothing to click and nothing to
 * read. The visitor cannot tell a slow network from a broken site. Twenty
 * seconds is far longer than a healthy sign-in (under three) and short enough
 * that a stall becomes a message instead of a spinner.
 */
async function post(url: string, body: unknown, timeoutMs = 20_000) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    role?: string;
    redirectTo?: string;
  };
  return { res, data };
}

/* ------------------------------------------------------------ Google SSO */

/**
 * The OAuth failures worth explaining.
 *
 * `email_in_use` is the one that matters: the callback deliberately refuses to
 * link a Google identity to an existing password account, because doing so
 * silently would be account takeover by email collision. Telling the visitor
 * to sign in with their password is the correct and only safe next step.
 */
const OAUTH_MESSAGE: Record<string, string> = {
  unavailable: "Google sign-in isn't switched on for this site yet. Please use your email and password.",
  cancelled: "Google sign-in was cancelled.",
  unverified: "That Google account hasn't confirmed its email address, so we can't use it to sign in.",
  email_in_use: "An account already exists with that email. Sign in with your password instead.",
  state: "That sign-in link expired. Please try again.",
  rate_limited: "Too many sign-in attempts. Please wait a few minutes.",
  suspended: "This account has been suspended. Please contact us.",
};

/**
 * Rendered only when the server reports Google OAuth is configured. A button
 * that always appears and always fails is worse than no button — it looks like
 * the site is broken rather than like the feature is not enabled.
 */
function GoogleButton({ enabled, next }: { enabled: boolean; next?: string | null }) {
  if (!enabled) return null;
  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";
  return (
    <>
      <div className="my-6 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--fg)_14%,transparent)]" />
        <span className="label text-faint">or</span>
        <span className="h-px flex-1 bg-[color-mix(in_srgb,var(--fg)_14%,transparent)]" />
      </div>
      <a
        href={href}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-sm)] border border-line bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] px-5 text-[0.95rem] font-medium text-fg transition-colors hover:border-moss-400/60 hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]"
      >
        <svg viewBox="0 0 18 18" aria-hidden className="h-4 w-4">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 009 18z" />
          <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 010-3.44V4.94H.96a9 9 0 000 8.12l3.02-2.34z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 00.96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        Continue with Google
      </a>
    </>
  );
}

/* -------------------------------------------------------------- LoginForm */

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const params = useSearchParams();
  const next = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Set by /api/auth/google/callback when a sign-in could not complete.
  const oauthError = params.get("oauth");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { res, data } = await post("/api/auth/login", { email, password });
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't sign you in. Please try again.");
        setBusy(false);
        return;
      }
      analytics.portalLogin(data.role ?? "unknown");
      /*
        `next` is honoured only when it is an internal /portal path — anything
        else, including a protocol-relative "//evil.example", falls back to the
        destination the SERVER chose for this role. A ?next= that could point
        off-site is an open redirect wearing a convenience feature.
      */
      const target =
        next && next.startsWith("/portal") && !next.startsWith("//")
          ? next
          : (data.redirectTo ?? "/portal");
      /*
        A FULL PAGE LOAD, not a client-side navigation.

        `router.replace()` followed by `router.refresh()` raced: the refresh
        invalidated the transition that was still in flight, the RSC request for
        the destination came back net::ERR_ABORTED, and the form sat on
        "Signing in…" forever while the session cookie was already set.

        A hard navigation is also simply the honest thing to do after
        authenticating — the document request carries the new cookie, and no
        part of the client router cache survives from the signed-out session.
        One reload is a small price for a transition that cannot half-happen.
      */
      window.location.assign(target);
      return;
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "That took too long to respond. Please try again in a moment."
          : "Network problem. Please check your connection and try again."
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      {error && <ErrorNote>{error}</ErrorNote>}
      {!error && oauthError && (
        <ErrorNote>
          {OAUTH_MESSAGE[oauthError] ?? "We couldn't complete that sign-in. Please try again."}
        </ErrorNote>
      )}

      <div className="flex items-center justify-between gap-4 pt-1">
        <Link
          href="/forgot-password"
          /*
            Padding-in / margin-out, so the recovery link is a real touch
            target on a phone without shifting where it sits in the form.

            `min-h-11` is stated outright rather than left to padding plus line
            height, which landed a fraction under 44px and kept turning up in
            the target audit. A number the browser has to arrive at by addition
            is a number that drifts the next time the type size changes.
          */
          className="inline-flex min-h-11 items-center py-3 -my-3 text-[0.85rem] text-muted underline underline-offset-4 transition-colors hover:text-fg"
        >
          Forgot your password?
        </Link>
      </div>

      <Action type="submit" size="lg" className="w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Action>

      <GoogleButton enabled={googleEnabled} next={next} />
    </form>
  );
}

/* ----------------------------------------------------------- RegisterForm */

const PATHWAYS = [
  { key: "study", icon: "🎓", title: "Study abroad", blurb: "Education that leads to work" },
  { key: "career", icon: "💼", title: "Global career", blurb: "Roles with European employers" },
  { key: "business", icon: "🏢", title: "Business setup", blurb: "EU entity, licensing, relocation" },
];

export function RegisterForm() {
  const [step, setStep] = useState(1);
  const [pathway, setPathway] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    THE UNDERTAKING IS NO LONGER SIGNED HERE.

    It used to be part of sign-up, and it said "all documents and information
    provided by me are genuine and accurate" — at a point where there were no
    documents and no information, so the sentence had nothing to refer to at
    the moment somebody signed it. It is now the last section of the
    application, taken on the completed file, and nothing submits without it.

    What remains at sign-up is an ordinary account agreement, which is all
    creating an account actually requires.
  */

  function choose(key: string) {
    setPathway(key);
    analytics.registrationStart(key);
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const { res, data } = await post("/api/auth/register", {
        name,
        email,
        password,
        pathway,
      });
      if (!res.ok || !data.ok) {
        setError(data.error ?? "We couldn't create that account.");
        setBusy(false);
        return;
      }
      analytics.registrationComplete(data.role ?? "unknown");
      // Straight to their own dashboard, chosen by the server from the role it
      // just assigned — never from anything this form holds. Full load, for the
      // same reason as sign-in: a client transition can be cancelled mid-flight
      // and leave the button spinning over a session that already exists.
      window.location.assign(data.redirectTo ?? "/portal");
      return;
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "That took too long to respond. Please try again in a moment."
          : "Network problem. Please check your connection and try again."
      );
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <div>
        <p className="field-label mb-4">What brings you to SnZ Ventures?</p>
        <div className="grid gap-2.5">
          {PATHWAYS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => choose(p.key)}
              className="group flex items-center gap-4 rounded-[var(--radius-md)] border border-line bg-raised p-4 text-left transition-all duration-400 hover:-translate-y-px hover:border-moss-400/60"
            >
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-line text-lg"
              >
                {p.icon}
              </span>
              <span className="flex-1">
                <span className="block text-[1rem] font-semibold tracking-[-0.01em] text-fg">
                  {p.title}
                </span>
                <span className="mt-0.5 block text-[0.85rem] text-muted">{p.blurb}</span>
              </span>
              <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-3 w-3 shrink-0 text-accent opacity-0 transition-all duration-400 group-hover:translate-x-1 group-hover:opacity-100">
                <path d="M1 6h9M6.5 2.5L10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
        <p className="mt-5 text-[0.8rem] text-faint">
          This shapes your dashboard. You can talk to us about the others at any
          time.
        </p>
      </div>
    );
  }

  return (
    <motion.form
      onSubmit={submit}
      noValidate
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-5"
    >
      <button
        type="button"
        onClick={() => setStep(1)}
        className="label flex items-center gap-2 text-muted transition-colors hover:text-fg"
      >
        <svg viewBox="0 0 12 12" fill="none" aria-hidden className="h-2.5 w-2.5">
          <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {PATHWAYS.find((p) => p.key === pathway)?.title}
      </button>

      <Field id="name" label="Full name" value={name} onChange={setName} autoComplete="name" />
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint="At least 4 characters."
      />
      <Field
        id="confirm"
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        error={confirm && password !== confirm ? "These don't match yet." : undefined}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Action type="submit" size="lg" className="w-full">
        {busy ? "Creating your account…" : "Create account"}
      </Action>

      <p className="text-center text-[0.78rem] leading-relaxed text-faint">
        Creating an account means you accept our{" "}
        <a
          href="https://snzventures.com/legal/terms"
          target="_blank"
          rel="noopener"
          className="text-accent underline underline-offset-4"
        >
          terms
        </a>{" "}
        and{" "}
        <a
          href="https://snzventures.com/legal/privacy-policy"
          target="_blank"
          rel="noopener"
          className="text-accent underline underline-offset-4"
        >
          privacy policy
        </a>
        .{" "}
        {pathway === "study" &&
          "The Student Consent & Undertaking is signed later, with your completed application."}
      </p>
    </motion.form>
  );
}

/* ----------------------------------------------------------- ForgotForm */

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await post("/api/auth/forgot-password", { email }).catch(() => undefined);
    // Always the same outcome — never reveal whether an account exists.
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="rounded-[var(--radius-md)] border border-line bg-raised p-6">
        <p className="text-[0.95rem] font-semibold text-fg">Check your inbox</p>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">
          If that address has an account, we&rsquo;ve sent reset instructions to
          it. The link expires in 30 minutes.
        </p>
        <Link
          href="/login"
          className="label mt-5 inline-flex items-center gap-2 text-accent"
        >
          <span className="draw">Back to sign in</span>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Action type="submit" size="lg" className="w-full">
        {busy ? "Sending…" : "Send reset link"}
      </Action>
    </form>
  );
}

/* ------------------------------------------------------------ ResetForm */

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    const { res, data } = await post("/api/auth/reset-password", { token, password });
    if (!res.ok || !data.ok) {
      setError(data.error ?? "We couldn't reset your password.");
      setBusy(false);
      return;
    }
    // Full load — see the note on sign-in. This also establishes a session.
    window.location.assign("/portal");
  }

  if (!token) {
    return (
      <ErrorNote>
        That reset link is incomplete. Please{" "}
        <Link href="/forgot-password" className="underline underline-offset-2">
          request a new one
        </Link>
        .
      </ErrorNote>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        id="password"
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint="At least 4 characters."
      />
      <Field
        id="confirm"
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Action type="submit" size="lg" className="w-full">
        {busy ? "Saving…" : "Set new password"}
      </Action>
    </form>
  );
}

/* ------------------------------------------------ auth-not-configured note */

/**
 * Amber is picked PER THEME, for the same reason `ErrorNote` above is.
 *
 * This was `text-warn` over a heading and `text-warn` over the body,
 * chosen when the site was dark by default. Light is the default now, and pale
 * amber on a pale amber tint measured 1.32:1 and 1.01:1 — `npm run audit:theme`
 * fails /login and /register on it. 1.01:1 is text the same brightness as its
 * own background: the notice explaining why nobody can sign in was, in the
 * theme most visitors get, effectively invisible.
 *
 * The dark values are kept for the dark theme, where they were always correct.
 */
export function AuthUnavailable() {
  return (
    <div className={cn("rounded-[var(--radius-md)] border border-amber-400/40 bg-amber-400/10 p-5")}>
      <p className="label text-warn">
        Portal not yet enabled
      </p>
      <p className="mt-2 text-[0.85rem] leading-relaxed text-warn">
        Accounts are unavailable because this deployment has no{" "}
        <span className="font-mono text-[0.85rem]">AUTH_SECRET</span> configured.
        Set one and restart to enable the client portal — see{" "}
        <span className="font-mono text-[0.85rem]">CONTENT-HANDOFF.md</span>.
      </p>
    </div>
  );
}

/* ----------------------------------------------------- email confirmation */

/**
 * CONFIRMS THE EMAIL TOKEN.
 *
 * The registration email's link previously pointed at /verify-email, which was
 * never built — so every confirmation link 404'd and no account could be
 * verified at all. This is the missing other half.
 *
 * WHY A POST FROM THE CLIENT RATHER THAN A SERVER COMPONENT.
 * Consuming the token during a GET render would let anything that merely
 * FETCHES the link burn it — mail scanners, link previewers and corporate
 * security gateways all follow URLs in email before a human ever clicks. They
 * issue plain GETs and do not run scripts, so requiring JavaScript and a POST
 * means the token is only ever spent by a real visitor. It is the same reason
 * `isTokenValid` exists separately from `consumeToken` in lib/auth/store.ts.
 *
 * The page has already checked the token is live, so this runs on mount and
 * the visitor is not asked to press a second button for something they
 * already confirmed by clicking the one in their inbox.
 */
export function VerifyEmailConfirm({ token }: { token: string }) {
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState<string | null>(null);
  /*
    The token is single-use. React StrictMode runs effects twice in
    development, and the second POST would find the token already spent and
    report failure over the top of a success that genuinely happened.
  */
  const started = useRef(false);

  const confirm = useCallback(async () => {
    setState("working");
    setError(null);
    const { res, data } = await post("/api/auth/verify-email", { token });
    if (!res.ok || !data.ok) {
      setError(data.error ?? "We couldn't confirm that link.");
      setState("failed");
      return;
    }
    setState("done");
  }, [token]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void confirm();
  }, [confirm]);

  if (state === "working") {
    return (
      <p role="status" className="text-[0.9rem] leading-relaxed text-muted">
        Confirming your email address…
      </p>
    );
  }

  if (state === "failed") {
    return (
      <div className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        <button
          type="button"
          onClick={() => void confirm()}
          className="label inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] border border-line text-fg transition-colors hover:border-moss-400/70 hover:text-accent"
        >
          Try again
        </button>
        <p className="text-[0.85rem] leading-relaxed text-muted">
          Still not working? Sign in and we&rsquo;ll send a fresh confirmation
          link.{" "}
          <Link href="/login" className="font-semibold text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p
        role="status"
        className="rounded-[var(--radius-sm)] border border-moss-400/45 bg-moss-400/10 px-4 py-3 text-[0.9rem] leading-relaxed text-fg"
      >
        Your email address is confirmed.
      </p>
      {/*
        A full load rather than a router push — the same reason the sign-in
        forms use one. It re-reads the session cookie server-side instead of
        rendering the portal from a client cache that predates verification.
      */}
      <a
        href="/portal"
        className="label inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] bg-moss-400 px-5 text-navy-950 transition-colors hover:bg-moss-300"
      >
        Go to your portal
      </a>
    </div>
  );
}

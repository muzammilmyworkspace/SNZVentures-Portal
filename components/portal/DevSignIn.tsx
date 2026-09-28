"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The local shortcut past the sign-in form.
 *
 * Styled to look like scaffolding rather than part of the product — a dashed
 * border and a plain heading — so that if it ever appears somewhere it should
 * not, it reads as obviously wrong at a glance instead of blending in. The
 * server decides whether it renders at all; this only has to be recognisable.
 */

type Account = { key: string; label: string; email: string };

export function DevSignIn({ accounts }: { accounts: readonly Account[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(key: string) {
    setError(null);
    setBusy(key);
    try {
      const res = await fetch("/api/dev/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't work.");
        return;
      }
      router.push(data.redirectTo ?? "/portal");
      router.refresh();
    } catch {
      setError("Network problem.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 rounded-[var(--radius-sm)] border border-dashed border-line p-4">
      <p className="label text-faint">Local development only</p>
      <p className="mt-1.5 text-[0.8rem] leading-relaxed text-muted">
        Sign in as a seeded test account. This is not on any deployment.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {accounts.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => signIn(a.key)}
            disabled={busy !== null}
            title={a.email}
            className="label min-h-11 rounded-[var(--radius-sm)] border border-line px-4 text-muted transition-colors hover:border-fg hover:text-fg disabled:opacity-50"
          >
            {busy === a.key ? "Signing in…" : a.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[0.8rem] leading-relaxed text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

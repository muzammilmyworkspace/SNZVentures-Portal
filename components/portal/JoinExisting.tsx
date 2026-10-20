"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Link an account that already exists to the consultant who sent the link.
 *
 * A confirm button rather than something automatic on page load: attaching an
 * account to a consultant decides who is paid for that student, and a GET that
 * did it would fire from a link preview, a prefetch or a mistyped URL.
 */
export function JoinExisting({
  consultantName,
  token,
}: {
  consultantName: string;
  token: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function link() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portal/invites/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't go through. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="note-ok p-4 text-[0.88rem] leading-relaxed">
          Done — <strong className="font-semibold">{consultantName}</strong> is now your
          consultant.
        </p>
        <button
          type="button"
          onClick={() => router.push("/portal")}
          className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300"
        >
          Go to your portal
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[0.88rem] leading-relaxed text-muted">
        You are already signed in, so there is no need to create another account.{" "}
        <strong className="font-semibold text-fg">{consultantName}</strong> can be added as your
        consultant instead.
      </p>

      {error && (
        <p role="alert" className="note-danger p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={link}
        disabled={busy}
        className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
      >
        {busy ? "Linking…" : `Make ${consultantName} my consultant`}
      </button>

      <p className="text-[0.8rem] leading-relaxed text-faint">
        Don&rsquo;t recognise that name? Don&rsquo;t continue — close this page and tell us at{" "}
        <a href="mailto:study@snzventures.com" className="underline underline-offset-4 hover:text-fg">
          study@snzventures.com
        </a>
        .
      </p>
    </div>
  );
}

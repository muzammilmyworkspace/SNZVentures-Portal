"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Enter the sending credential, from the portal, without a deploy.
 *
 * The key is posted once and never comes back: the server seals it and the
 * status panel above only ever reports whether one exists. There is no "show
 * current key" because there is nothing to show — replacing it is the only
 * edit, which is also how a rotation should work.
 *
 * Sending a test message is part of the same panel rather than a separate
 * step, because "saved" and "works" are different facts and the gap between
 * them is exactly where this got stuck before.
 */
export function MailSetup({
  source,
  canTest,
}: {
  source: "environment" | "portal" | "none";
  /** A transport exists, wherever it came from — so a test can actually be sent. */
  canTest: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [from, setFrom] = useState("SnZ Ventures <noreply@snzventures.com>");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, fromAddress: from }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't save.");
        return;
      }
      setApiKey("");
      setOpen(false);
      setNote("Saved. Send a test message to confirm it works.");
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setError(null);
    setNote(null);
    setTesting(true);
    try {
      const res = await fetch("/api/admin/mail", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sentTo?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "The test message did not go out.");
        return;
      }
      setNote(`Sent to ${data.sentTo}. If it does not arrive, check the spam folder.`);
      router.refresh();
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-line p-4">
      {error && (
        <p role="alert" className="note-danger mb-3 p-3 text-[0.85rem] leading-relaxed">
          {error}
        </p>
      )}
      {note && <p className="note-ok mb-3 p-3 text-[0.85rem] leading-relaxed">{note}</p>}

      {/*
        THE TEST IS OFFERED WHEREVER THE KEY CAME FROM.

        It used to appear only for a key entered here, which left the
        environment-configured case — the one actually in production — with no
        way to confirm anything from the portal at all. Whether a message goes
        out is the same question either way, and it is the only one that
        settles the argument.
      */}
      {canTest && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sendTest}
              disabled={testing}
              className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
            >
              {testing ? "Sending…" : "Send a test message"}
            </button>
          </div>
          <div className="mt-3">
            <label htmlFor="mail-test-to" className="field-label">
              Send the test to <span className="text-faint">(optional)</span>
            </label>
            <input
              id="mail-test-to"
              type="email"
              className="field"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Leave blank to send to yourself"
            />
          </div>
        </div>
      )}

      {source === "environment" ? (
        <p className="text-[0.85rem] leading-relaxed text-muted">
          This deployment sets its own mail credentials, so there is nothing to enter here.
          Change them where they are set, then redeploy.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300"
            >
              {source === "portal" ? "Replace the key" : "Add a Resend key"}
            </button>

          </div>

          {open && (
            <form onSubmit={save} className="mt-4 space-y-3">
              <div>
                <label htmlFor="mail-key" className="field-label">
                  Resend API key
                </label>
                <input
                  id="mail-key"
                  type="password"
                  required
                  autoComplete="off"
                  className="field"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="re_..."
                  aria-describedby="mail-key-hint"
                />
                <p id="mail-key-hint" className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
                  From resend.com → API Keys. Stored encrypted and never shown again — to change
                  it later, paste a new one.
                </p>
              </div>

              <div>
                <label htmlFor="mail-from" className="field-label">
                  Send as
                </label>
                <input
                  id="mail-from"
                  type="text"
                  required
                  className="field"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-describedby="mail-from-hint"
                />
                <p id="mail-from-hint" className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
                  The domain in this address has to be verified on that Resend account, or every
                  message is rejected.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={busy || !apiKey || !from}
                  className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] inline-flex min-h-11 items-center rounded-full bg-moss-400 px-5 text-[#070B1A] transition-colors hover:bg-moss-300 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

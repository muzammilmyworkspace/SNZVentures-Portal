"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker } from "./AvatarPicker";

/**
 * Change your photo after sign-up. The picker is the same one the sign-up
 * forms use; this only saves what it produces, as soon as it is chosen.
 */
export function ProfilePhoto({ name, current }: { name: string; current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState<string | null>(current);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    const prev = value;
    setValue(next);
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/portal/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "That didn't save.");
      setState("saved");
      router.refresh();
    } catch (e) {
      setValue(prev);
      setState("error");
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
  }

  return (
    <div>
      <AvatarPicker value={value} onChange={(v) => void save(v)} name={name} />
      <p role="status" className="mt-2 min-h-[1.2em] text-[0.78rem]">
        {state === "saving" && <span className="text-muted">Saving…</span>}
        {state === "saved" && <span className="text-accent">Saved. Staff now see this photo next to your name.</span>}
        {state === "error" && <span className="text-danger">{error}</span>}
      </p>
    </div>
  );
}

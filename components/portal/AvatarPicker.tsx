"use client";

import { useRef, useState } from "react";

/**
 * A profile photo, chosen before the account exists.
 *
 * WHY IT IS NOT AN UPLOAD. Both places this appears — a consultant setting up
 * their account, a student signing up — happen before there is a session, and
 * document storage requires one. Waiting until after would mean asking on a
 * later screen, which is the pattern that left every consultant profile empty.
 *
 * So the browser does the work: the file is drawn to a canvas, cropped square,
 * scaled to 256px and re-encoded as JPEG. That lands around 20KB whatever was
 * picked — a 6MB phone photo included — which is small enough to travel in the
 * form itself and to live in `users.avatar_url`.
 *
 * The original file never leaves the device. Only the 256px version is sent.
 */

const SIZE = 256;
/** Refused rather than resized. A file this large is not a photo of a person. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export function AvatarPicker({
  value,
  onChange,
  name,
}: {
  value: string | null;
  onChange: (dataUri: string | null) => void;
  /** For the initials shown until a photo is chosen. */
  name: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  async function pick(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("That image is too large. Pick one under 12MB.");
      return;
    }

    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);

      /*
        Centre crop to a square before scaling, so a portrait photo becomes a
        head rather than a squashed one. Everything else here is arithmetic on
        the shorter side.
      */
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - side) / 2;
      const sy = (bitmap.height - side) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
      bitmap.close?.();

      // JPEG, not PNG: a photograph as PNG is several times the size for no
      // visible gain at 256px.
      onChange(canvas.toDataURL("image/jpeg", 0.82));
    } catch {
      setError("That image could not be read. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="field-label">Profile photo</span>

      <div className="mt-1.5 flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] text-[1.05rem] font-semibold text-muted"
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="font-[family-name:var(--font-display)] font-semibold text-[0.95rem] tracking-[-0.005em] min-h-11 rounded-full border border-line px-4 text-muted transition-colors hover:border-fg hover:text-fg disabled:opacity-50"
          >
            {busy ? "Preparing…" : value ? "Change photo" : "Add a photo"}
          </button>

          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="label min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-fg"
            >
              Remove
            </button>
          )}
        </div>

        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so picking the same file twice still fires a change.
            e.target.value = "";
            if (file) void pick(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.75rem] leading-relaxed text-danger">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
          Optional. Shown next to your name in the portal. Cropped square and resized on your
          device before it is sent.
        </p>
      )}
    </div>
  );
}

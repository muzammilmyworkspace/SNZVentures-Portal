import { cn } from "@/lib/utils";

/**
 * A PERSON, AS A CIRCLE.
 *
 * Their photo when they have one, otherwise the first letters of their first
 * and last name on a colour chosen from their id — so the same person is the
 * same colour on every page, and two people side by side are rarely alike.
 *
 * Server-safe (no hooks). `photo` comes from the list query (`has_avatar`), so
 * a person with no photo never costs an image request.
 */

const FILLS = ["#2563C9", "#B4471C", "#12805A", "#6D4FC2", "#A8326B", "#0E7490", "#8A6100", "#4B5A8A"];

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function fillFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FILLS[h % FILLS.length];
}

const SIZES = {
  xs: "h-6 w-6 text-[0.6rem]",
  sm: "h-8 w-8 text-[0.7rem]",
  md: "h-10 w-10 text-[0.8rem]",
  lg: "h-14 w-14 text-[1rem]",
} as const;

export function Avatar({
  id,
  name,
  photo = false,
  v,
  size = "sm",
  className,
}: {
  id: string;
  name: string;
  photo?: boolean;
  /** Changes when the photo does, so the cached image is replaced. */
  v?: string | number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide text-white ring-1 ring-[var(--line)]",
        SIZES[size],
        className
      )}
      style={photo ? undefined : { background: fillFor(id || name) }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatar/${id}${v ? `?v=${encodeURIComponent(String(v))}` : ""}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/** Avatar beside a name (and an optional second line), for table cells. */
export function Person({
  id,
  name,
  sub,
  photo,
  v,
  size = "sm",
  children,
}: {
  id: string;
  name: string;
  sub?: React.ReactNode;
  photo?: boolean;
  v?: string | number | null;
  size?: keyof typeof SIZES;
  children?: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar id={id} name={name} photo={photo} v={v} size={size} />
      <span className="min-w-0">
        {children ?? <span className="block truncate text-fg">{name}</span>}
        {sub && <span className="block truncate text-[0.8rem] text-faint">{sub}</span>}
      </span>
    </span>
  );
}

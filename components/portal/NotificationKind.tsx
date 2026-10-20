/**
 * What kind of notification it is, as an icon in a tinted circle. Shared by
 * the bell and the Notifications page. The title always says what happened;
 * the icon only helps the eye sort a long list.
 */
const KINDS: Record<string, { color: string; path: string; label: string }> = {
  message: { color: "#3987e5", label: "Message", path: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" },
  document: { color: "#c98500", label: "Document", path: "M4 1.5h5.5l3 3V14.5H4zM9.5 1.5v3h3" },
  status: { color: "#72C43C", label: "Update", path: "M3 8.5l3 3 7-7" },
  appointment: { color: "#9085e9", label: "Consultation", path: "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3" },
  task: { color: "#4fb3c9", label: "Task", path: "M3 4h10M3 8h10M3 12h6" },
  general: { color: "#8B97B0", label: "Notice", path: "M8 2.5a4 4 0 0 0-4 4v3l-1.5 2h11L12 9.5v-3a4 4 0 0 0-4-4zM6.5 13.5a1.5 1.5 0 0 0 3 0" },
};

export function NotificationIcon({ kind, size = 36 }: { kind: string; size?: number }) {
  const k = KINDS[kind] ?? KINDS.general;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, color: k.color, background: `color-mix(in srgb, ${k.color} 16%, transparent)` }}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.45, height: size * 0.45 }}>
        <path d={k.path} />
      </svg>
    </span>
  );
}

export function kindLabel(kind: string): string {
  return (KINDS[kind] ?? KINDS.general).label;
}

/** "Just now", "5 min ago", "Yesterday", "3 Oct". */
export function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

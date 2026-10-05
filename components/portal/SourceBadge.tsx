/**
 * WHERE SOMEBODY CAME FROM, as a small labelled chip.
 *
 * The dot carries the channel's own colour so it is recognisable at a glance;
 * the word carries the meaning, so nothing depends on telling colours apart.
 */
const CHANNELS: Record<string, { label: string; dot: string }> = {
  google: { label: "Google", dot: "#4285F4" },
  facebook: { label: "Facebook", dot: "#1877F2" },
  instagram: { label: "Instagram", dot: "#E1306C" },
  whatsapp: { label: "WhatsApp", dot: "#25D366" },
  tiktok: { label: "TikTok", dot: "#FE2C55" },
  linkedin: { label: "LinkedIn", dot: "#0A66C2" },
  youtube: { label: "YouTube", dot: "#FF0000" },
  x: { label: "X", dot: "#8B97B0" },
  bing: { label: "Bing", dot: "#00809D" },
  email: { label: "Email", dot: "#C98500" },
  direct: { label: "Direct", dot: "#8B97B0" },
  other: { label: "Other site", dot: "#8B97B0" },
};

export function sourceLabel(key: string | null): string {
  return key ? CHANNELS[key]?.label ?? key : "Not recorded";
}

export function SourceBadge({ source }: { source: string | null }) {
  if (!source) {
    return <span className="text-[0.8rem] text-faint">Not recorded</span>;
  }
  const c = CHANNELS[source] ?? { label: source, dot: "#8B97B0" };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] px-2.5 py-0.5 text-[0.78rem] font-medium text-fg">
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

export const PLACEMENT_LABEL: Record<string, string> = {
  floating: "Floating button",
  form_success: "After the form",
  footer: "Footer",
  header: "Header",
  page: "In the page",
};

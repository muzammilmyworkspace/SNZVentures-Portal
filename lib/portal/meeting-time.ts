/**
 * A meeting time, said the way both sides read it: Lithuania (where SnZ is)
 * and Pakistan (where most students are). "Tue 7 Oct 2026, 15:00 Lithuania
 * time (17:00 Pakistan time)".
 */
export function meetingTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Vilnius" });
  const lt = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vilnius" });
  const pk = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
  return `${day}, ${lt} Lithuania time (${pk} Pakistan time)`;
}

export const MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  office: "At the office",
};

/**
 * Student stages as the consultant dashboard shows them. Shared by the server
 * page (counts) and the client roster (track), so it lives outside any
 * "use client" module. Keys match getAdvisorBoard in lib/db/repos/portal.ts.
 */
export const STAGES: { key: string; label: string; step: number }[] = [
  { key: "fee_due", label: "Fee due", step: 1 },
  { key: "fee_rejected", label: "Fee resubmission", step: 1 },
  { key: "fee_review", label: "Fee in review", step: 2 },
  { key: "application", label: "Application", step: 3 },
  { key: "consent_due", label: "Consent", step: 4 },
  { key: "complete", label: "Complete", step: 5 },
];

export const STAGE_BY_KEY: Record<string, (typeof STAGES)[number]> = Object.fromEntries(
  STAGES.map((s) => [s.key, s])
);

/** Stage counts for the consultant's students, in journey order. */
export function stageRows(clients: { role: string; stage: string }[]) {
  return STAGES.map((st) => ({
    label: st.label,
    value: clients.filter((c) => c.role === "student" && c.stage === st.key).length,
  }));
}

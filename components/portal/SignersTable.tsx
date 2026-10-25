import type { Signer, SignedKind } from "@/lib/portal/signed-docs";
import { EmptyState } from "./Pieces";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Everybody who signed a consent (or accepted the payment terms): the record
 * to show if an agreement is ever disputed. Each row opens the signed PDF,
 * with its certificate; a PDF not made yet is made the first time it opens.
 */
export function SignersTable({ kind, signers }: { kind: SignedKind; signers: Signer[] }) {
  if (signers.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="Nobody yet"
        body={
          kind === "payment_terms"
            ? "Students appear here as soon as they accept the payment terms and choose a plan."
            : "Students appear here as soon as they sign the consent with their application."
        }
      />
    );
  }
  const base = `/api/admin/signed-docs/${kind}`;
  return (
    <div className="rail overflow-x-auto">
      <table className="w-full min-w-[880px] text-left">
        <caption className="sr-only">{kind === "payment_terms" ? "Payment terms accepted" : "Consents signed"}</caption>
        <thead>
          <tr className="border-b border-line bg-[var(--pv-panel-2,transparent)]">
            {["#", "Student", "Version", kind === "payment_terms" ? "Accepted by" : "Signed as", "Date (Pakistan time)", "IP address", "Signed PDF", "Drive"].map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[0.76rem] font-semibold text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signers.map((s, i) => {
            const href = `${base}/${s.userId}?version=${encodeURIComponent(s.version)}`;
            return (
              <tr key={`${s.userId}-${s.version}`} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-[0.8rem] tabular-nums text-faint">{i + 1}</td>
                <td className="px-4 py-3">
                  <p className="text-[0.9rem] font-medium text-fg-strong">{s.name}</p>
                  <p className="text-[0.76rem] text-faint">
                    <span className="font-mono">{s.studentId}</span> · {s.email}
                  </p>
                </td>
                <td className="px-4 py-3 font-mono text-[0.76rem] text-muted">{s.version}</td>
                <td className="px-4 py-3 text-[0.86rem] text-fg">{kind === "payment_terms" ? "Ticked the box" : s.signedName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[0.84rem] text-muted">{when(s.signedAt)}</td>
                <td className="px-4 py-3 font-mono text-[0.76rem] text-faint">{s.ip ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <a href={href} target="_blank" rel="noopener" className="text-[0.84rem] font-semibold text-accent-ink hover:underline">
                    View
                  </a>
                  <span className="px-1.5 text-faint">·</span>
                  <a href={`${href}&download=1`} className="text-[0.84rem] font-semibold text-accent-ink hover:underline">
                    Download
                  </a>
                </td>
                <td className="px-4 py-3">
                  {s.inDrive ? <span className="pill pill-ok">In Drive</span> : <span className="pill pill-neutral">{s.docId ? "Pending" : "Not yet"}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

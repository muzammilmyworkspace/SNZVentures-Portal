import Link from "next/link";

/**
 * Shown when the deployment is missing DATABASE_URL. Distinct from an empty
 * state: an empty state means "nothing here yet", this means "this deployment
 * is not finished". Visible to staff and clients alike, in plain language,
 * because silently rendering zeroes would be misleading.
 */
export function NotConfigured({ what = "This area" }: { what?: string }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-amber-400/35 bg-amber-400/[0.06] p-7">
      <p className="label text-warn">Setup incomplete</p>
      <h2 className="mt-3 text-[1.25rem] font-bold tracking-[-0.02em] text-fg-strong">
        {what} needs a database connection.
      </h2>
      <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-muted">
        The portal is fully built, but this deployment has no{" "}
        <span className="font-mono text-[0.85rem]">DATABASE_URL</span> set, so
        there is nothing to read from yet. Add the variable in your hosting
        project settings, run the migrations, and this page fills in with no
        code change.
      </p>
      <p className="mt-4 text-[0.85rem] text-faint">
        See <span className="font-mono text-[0.8rem]">DEPLOYMENT.md</span> for the
        exact steps.
      </p>
      <Link
        href="/portal"
        className="label mt-6 inline-flex items-center gap-2 text-accent"
      >
        <span className="draw">Back to overview</span>
      </Link>
    </section>
  );
}

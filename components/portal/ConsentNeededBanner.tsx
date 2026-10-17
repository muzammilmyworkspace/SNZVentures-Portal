import Link from "next/link";

/**
 * A CONSULTANT WITHOUT A CONSENT FORM. The students a consultant onboards sign
 * that consultant's consent, not AdmitsFair', before their application can
 * be submitted. Until the consultant has published one, their students are
 * stuck at the last step; so this sits above every page, cannot be dismissed,
 * and goes away by itself once a consent is published.
 */
export function ConsentNeededBanner({ waiting }: { waiting: number }) {
  return (
    <div className="sticky top-0 z-[60] border-b border-amber-300/30 bg-[#2A2110] text-[#FDF3DC]">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <span aria-hidden className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
        </span>
        <p className="min-w-0 flex-1 text-[0.86rem] leading-snug">
          <strong className="font-semibold">Add your consent form.</strong> The students you onboard sign it before they submit
          their application (PDF, Word or typed).
          {waiting > 0 && (
            <>
              {" "}
              <strong className="font-semibold">
                {waiting} of your students {waiting === 1 ? "is" : "are"} waiting for it.
              </strong>
            </>
          )}
        </p>
        <Link
          href="/portal/admin/forms/consent"
          className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-amber-300 px-4 text-[0.84rem] font-semibold text-[#2A2110] transition-colors hover:bg-amber-200"
        >
          Add consent form →
        </Link>
      </div>
    </div>
  );
}

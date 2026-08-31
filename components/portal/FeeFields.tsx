"use client";

import {
  FEE_TYPES,
  PAYMENT_METHODS,
  CURRENCIES,
} from "@/lib/portal/payment-consent";

/**
 * The two field sets of Form A, transcribed from snz-consent-forms.html.
 *
 * EVERY FIELD HERE IS IN THAT DOCUMENT, and every field in that document is
 * here — same labels, same hints, same optional/required split, same order.
 * The form is a legal declaration; a question we invented would be a question
 * the signatory never agreed to answer, and one we dropped is a blank on a
 * signed page.
 *
 * ── ON THE LAYOUT BUG THIS FILE EXISTS TO PREVENT ──────────────────────────
 * `.field` is declared in globals.css, which is imported AFTER Tailwind. It
 * sets `width:100%`, and at equal specificity the later rule wins — so a
 * Tailwind width utility on a `.field` element does nothing at all. The
 * currency select was `w-28` and rendered full width, pushing the amount input
 * out of its own column and over the next one.
 *
 * The fix is not to fight it with `!important`. Widths are set on the GRID
 * instead: a field filling 100% of a sized column is exactly right, so
 * `.field` and the layout stop disagreeing. Do not put a `w-*` utility on a
 * `.field` here — it will be silently ignored.
 */

export type Facts = {
  // Your details — panel 2 of the source document
  name: string;
  father: string;
  passport: string;
  nationality: string;
  dob: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  // The payment — panel 3
  university: string;
  programme: string;
  feeType: string;
  currency: string;
  amount: string;
  method: string;
  txnRef: string;
  payDate: string;
  thirdParty: boolean;
  payerName: string;
  payerRelation: string;
};

export type SetFact = <K extends keyof Facts>(k: K, v: Facts[K]) => void;

function F({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="field-label">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-faint">
            {optional}
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════ 02 — Your details ═══ */

export function DetailsFields({ f, set }: { f: Facts; set: SetFact }) {
  return (
    <div className="space-y-5">
      <p className="text-[0.9rem] leading-relaxed text-muted">
        These flow straight into the declaration. A mismatch with your passport
        is the single most common reason a document has to be signed twice.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Full name" optional="as on passport">
          <input
            className="field"
            autoComplete="name"
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Usman Sajid"
          />
        </F>
        <F label="Father's / guardian's name" optional="optional">
          <input className="field" value={f.father} onChange={(e) => set("father", e.target.value)} />
        </F>
        <F label="Passport number">
          <input
            className="field uppercase"
            value={f.passport}
            onChange={(e) => set("passport", e.target.value.toUpperCase())}
            placeholder="JW557261"
          />
        </F>
        <F label="Nationality">
          <input
            className="field"
            value={f.nationality}
            onChange={(e) => set("nationality", e.target.value)}
            placeholder="Pakistani"
          />
        </F>
        <F label="Date of birth">
          <input type="date" className="field" value={f.dob} onChange={(e) => set("dob", e.target.value)} />
        </F>
        <F label="Email" optional="your signed copy goes here">
          <input
            type="email"
            className="field"
            autoComplete="email"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@example.com"
          />
        </F>
        <F label="Phone / WhatsApp">
          <input
            type="tel"
            className="field"
            autoComplete="tel"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+92 300 0000000"
          />
        </F>
        <F label="City & country of residence">
          <input
            className="field"
            value={f.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Lahore, Pakistan"
          />
        </F>
      </div>

      <F label="Residential address" optional="optional">
        <textarea
          rows={2}
          className="field"
          value={f.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </F>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ 03 — Payment ═══ */

export function PaymentFields({ f, set }: { f: Facts; set: SetFact }) {
  return (
    <div className="space-y-5">
      <p className="text-[0.9rem] leading-relaxed text-muted">
        State the fee yourself. Nothing here is pre-filled — the amount on the
        declaration is the amount you type.
      </p>

      <F label="University / institution you applied to">
        <input
          className="field"
          value={f.university}
          onChange={(e) => set("university", e.target.value)}
          placeholder="Vilnius College of Design"
        />
      </F>

      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Programme applied for" optional="optional">
          <input className="field" value={f.programme} onChange={(e) => set("programme", e.target.value)} />
        </F>
        <F label="What is this fee for?">
          <select className="field" value={f.feeType} onChange={(e) => set("feeType", e.target.value)}>
            <option value="">Select…</option>
            {FEE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </F>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Amount you are transferring">
          {/*
            Grid, not flex-with-widths. See the note at the top of this file:
            a `w-*` utility on a `.field` is silently ignored, so the column
            sizes are set here and each control simply fills its own cell.
          */}
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
            <select
              aria-label="Currency"
              className="field"
              value={f.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              className="field"
              inputMode="decimal"
              value={f.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="150.00"
              aria-label="Amount"
            />
          </div>
        </F>
        <F label="How are you sending it?">
          <select className="field" value={f.method} onChange={(e) => set("method", e.target.value)}>
            <option value="">Select…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </F>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <F label="Transfer reference" optional="optional">
          <input
            className="field"
            value={f.txnRef}
            onChange={(e) => set("txnRef", e.target.value)}
            placeholder="TRX-99381"
          />
        </F>
        <F label="Date of transfer" optional="optional">
          <input
            type="date"
            className="field"
            value={f.payDate}
            onChange={(e) => set("payDate", e.target.value)}
          />
        </F>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-line p-4 transition-colors hover:border-line-strong">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-moss-400"
          checked={f.thirdParty}
          onChange={(e) => set("thirdParty", e.target.checked)}
        />
        <span>
          <span className="block text-[0.88rem] font-semibold text-fg">
            Somebody else is sending the money for me
          </span>
          <span className="mt-1 block text-[0.82rem] leading-relaxed text-muted">
            Tick this if a friend or relative is transferring the fee on your
            behalf. Their name goes into the declaration so the payment can be
            matched to your file.
          </span>
        </span>
      </label>

      {f.thirdParty && (
        <div className="grid gap-5 sm:grid-cols-2">
          <F label="Name of the person paying">
            <input
              className="field"
              value={f.payerName}
              onChange={(e) => set("payerName", e.target.value)}
              placeholder="Mr Subhan Ali"
            />
          </F>
          <F label="Their relationship to you">
            <input
              className="field"
              value={f.payerRelation}
              onChange={(e) => set("payerRelation", e.target.value)}
              placeholder="Friend / Brother"
            />
          </F>
        </div>
      )}
    </div>
  );
}

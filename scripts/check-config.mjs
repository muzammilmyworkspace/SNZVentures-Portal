/**
 * CONFIGURATION PREFLIGHT — what is actually wired up, right now.
 *
 *   npm run check:config                    (this machine, from .env.local)
 *   PROD=https://snzv-website.vercel.app npm run check:config   (the deployment)
 *
 * Every check here TALKS TO THE SERVICE rather than asking whether a variable
 * is set. A key of the right length that Supabase rejects is worse than no key
 * at all, because it looks configured. This is the difference between "the
 * variable exists" and "uploads work".
 *
 * Nothing here prints a secret. Lengths and verdicts only.
 */
import "./lib/env.mjs";

const PROD = process.env.PROD ?? null;
let problems = 0;

const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => { problems++; console.log(`  TODO  ${m}`); };
const head = (m) => console.log(`\n${m}\n`);

head(PROD ? `Deployment  (${PROD})` : "This machine  (.env.local)");

/* ---------------------------------------------------- 1. document storage */

const supaUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supaUrl) {
  warn("SUPABASE_URL is not set — document storage cannot work");
} else if (!supaKey) {
  warn("SUPABASE_SERVICE_ROLE_KEY is not set — uploads will be refused");
} else {
  const res = await fetch(`${supaUrl}/storage/v1/bucket`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));

  if (res.ok) {
    const buckets = await res.json().catch(() => []);
    const name = process.env.SUPABASE_DOCUMENTS_BUCKET ?? "client-documents";
    const found = Array.isArray(buckets) && buckets.find((b) => b.id === name);
    ok(`Supabase Storage accepts the service-role key (${supaKey.length} chars)`);
    if (!found) {
      ok(`bucket "${name}" will be created private on the first upload`);
    } else if (found.public) {
      warn(`bucket "${name}" is PUBLIC — anyone guessing a path can read a passport scan`);
    } else {
      ok(`bucket "${name}" exists and is private`);
    }
  } else {
    const body = await res.text().catch(() => "");
    warn(
      `Supabase Storage rejected the service-role key (${supaKey.length} chars, HTTP ${res.status}). ` +
        `A real key is ~200+ characters. ${body.slice(0, 90)}`
    );
  }
}

/* ------------------------------------------------------------- 2. mail out */

const transport = process.env.RESEND_API_KEY
  ? "resend"
  : process.env.MAIL_WEBHOOK_URL
    ? "webhook"
    : "none";

if (transport === "none") {
  warn(
    "no mail transport — password-reset links are written to the server log " +
      "instead of sent. Set RESEND_API_KEY (or MAIL_WEBHOOK_URL)."
  );
} else if (transport === "resend") {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  }).catch(() => null);
  res?.ok
    ? ok("Resend accepts the API key — reset emails will be sent")
    : warn(`Resend rejected the API key (HTTP ${res?.status ?? "no response"})`);

  process.env.MAIL_FROM
    ? ok(`sending as ${process.env.MAIL_FROM}`)
    : warn("MAIL_FROM is not set — Resend needs a verified sender address");
} else {
  ok("a mail webhook is configured");
}

/* ------------------------------------------------- 3. where links point to */

const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const platform = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const base = explicit || (platform ? `https://${platform}` : "https://www.snzventures.com");

const probe = PROD ?? base;
const res = await fetch(`${probe}/reset-password`, { redirect: "manual" }).catch(() => null);

if (res && res.status === 200) {
  ok(`reset links resolve: ${probe}/reset-password answers 200`);
} else {
  warn(
    `reset links would point at ${probe}/reset-password, which answers ` +
      `${res?.status ?? "nothing"}. A mailed link there is a dead end. ` +
      `Set NEXT_PUBLIC_SITE_URL to the host that serves the portal.`
  );
}

/* --------------------------------------------------------- 4. QA accounts */

if (process.env.DATABASE_URL) {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require", prepare: false });
  try {
    const rows = await sql`SELECT email FROM users WHERE email LIKE '%.demo@snzventures.com'`;
    rows.length === 0
      ? ok("no QA accounts on the database")
      : warn(
          `${rows.length} QA account(s) still exist with the shared test password. ` +
            `Remove before launch: npm run qa:accounts -- --remove`
        );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

console.log(
  problems === 0
    ? "\n  EVERYTHING IS CONFIGURED\n"
    : `\n  ${problems} THING(S) STILL TO DO\n`
);

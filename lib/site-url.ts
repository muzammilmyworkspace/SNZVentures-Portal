import { company } from "@/data/company";

/**
 * WHERE THIS DEPLOYMENT ACTUALLY LIVES.
 *
 * Used to build links that are mailed out — password resets above all. Getting
 * it wrong is not cosmetic: a reset link pointing at a host that does not serve
 * the portal is a locked-out user who stays locked out.
 *
 * That is exactly what was happening. The fallback was `company.siteUrl`
 * (www.snzventures.com), which is the marketing domain and is NOT currently the
 * Vercel deployment — every portal path on it answers 404. So the one link in
 * the email led nowhere.
 *
 * THE REQUEST'S OWN HOST HEADER IS DELIBERATELY NOT USED, tempting as it is.
 * It is attacker-controlled. Someone posting to /api/auth/forgot-password with
 * a forged Host would have a real reset token mailed to the account owner
 * pointing at the attacker's domain — host-header injection straight into
 * account takeover. `VERCEL_PROJECT_PRODUCTION_URL` is injected by the platform
 * at runtime and cannot be influenced by the caller, which is the whole point.
 *
 * Order: an explicit setting wins, then what the platform knows about itself,
 * then the marketing domain as a last resort.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return company.siteUrl.replace(/\/+$/, "");
}

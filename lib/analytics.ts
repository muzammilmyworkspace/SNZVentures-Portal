/**
 * CENTRALISED ANALYTICS
 * ---------------------------------------------------------------------------
 * The ONLY place tracking is emitted from. No vendor snippet is written inline
 * anywhere else in this codebase, and no component calls gtag/fbq directly.
 *
 * Providers are activated purely by environment variable — set the ID and the
 * loader mounts; leave it unset and nothing ships. See .env.example.
 *
 *   NEXT_PUBLIC_GTM_ID          Google Tag Manager      (preferred umbrella)
 *   NEXT_PUBLIC_GA4_ID          GA4, if used standalone
 *   NEXT_PUBLIC_CLARITY_ID      Microsoft Clarity
 *   NEXT_PUBLIC_META_PIXEL_ID   Meta Pixel
 *   NEXT_PUBLIC_GADS_ID         Google Ads
 *
 * PRIVACY: never pass names, emails, phone numbers or free-text answers into
 * `params`. `sanitise()` strips anything that looks like PII as a backstop, but
 * the rule is enforced at the call site — pass categories, not people.
 */

export type AnalyticsEvent =
  | "page_view"
  | "cta_click"
  | "service_view"
  | "destination_view"
  | "pathway_select"
  | "form_start"
  | "form_step_completed"
  | "form_submit"
  | "generate_lead"
  | "consultation_request"
  | "whatsapp_click"
  | "phone_click"
  | "email_click"
  | "file_download"
  | "faq_open"
  | "article_view"
  | "outbound_click"
  | "login_click"
  | "registration_start"
  | "registration_complete"
  | "portal_login"
  | "portal_logout"
  | "popup_open"
  | "popup_close"
  | "popup_path_selected"
  | "video_play";

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

const PII =
  /(^|_)(email|mail|phone|tel|whatsapp|name|firstname|lastname|surname|address|message|dob)($|_)/i;
const LOOKS_LIKE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LOOKS_LIKE_PHONE = /(?:\+?\d[\s\-()]?){7,}/;

/** Strips PII-shaped keys and values before anything leaves the browser. */
function sanitise(params: Params = {}): Params {
  const clean: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (PII.test(k)) continue;
    if (
      typeof v === "string" &&
      (LOOKS_LIKE_EMAIL.test(v) || LOOKS_LIKE_PHONE.test(v))
    ) {
      continue;
    }
    // Cap free-text length so answers can't leak through a label field.
    clean[k] = typeof v === "string" ? v.slice(0, 90) : v;
  }
  return clean;
}

const isBrowser = () => typeof window !== "undefined";
const debug = () =>
  isBrowser() && process.env.NODE_ENV === "development";

/**
 * Emit an event to every configured destination.
 * Safe to call unconditionally — no-ops when nothing is configured.
 */
export function track(event: AnalyticsEvent, params: Params = {}): void {
  if (!isBrowser()) return;
  const payload = sanitise(params);

  // GTM / GA4 share the dataLayer contract.
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...payload });

  if (typeof window.gtag === "function") {
    window.gtag("event", event, payload);
  }

  // Meta Pixel — map to its standard events where a real equivalent exists.
  if (typeof window.fbq === "function") {
    const metaStandard: Partial<Record<AnalyticsEvent, string>> = {
      generate_lead: "Lead",
      consultation_request: "Schedule",
      form_submit: "CompleteRegistration",
      service_view: "ViewContent",
    };
    const mapped = metaStandard[event];
    if (mapped) window.fbq("track", mapped, payload);
    else window.fbq("trackCustom", event, payload);
  }

  if (typeof window.clarity === "function") {
    window.clarity("event", event);
  }

  if (debug()) {
    // eslint-disable-next-line no-console
    console.debug(`[analytics] ${event}`, payload);
  }
}

/** Convenience wrappers so call sites stay declarative and consistent. */
export const analytics = {
  pageView: (path: string, title?: string) =>
    track("page_view", { page_path: path, page_title: title }),

  ctaClick: (label: string, location: string) =>
    track("cta_click", { cta_label: label, cta_location: location }),

  pathwaySelect: (pathway: string, location: string) =>
    track("pathway_select", { pathway, location }),

  serviceView: (slug: string) => track("service_view", { service: slug }),

  destinationView: (slug: string) =>
    track("destination_view", { destination: slug }),

  articleView: (slug: string, category: string) =>
    track("article_view", { article: slug, category }),

  formStart: (formId: string) => track("form_start", { form_id: formId }),

  formStep: (formId: string, step: number, total: number, pathway?: string) =>
    track("form_step_completed", {
      form_id: formId,
      step,
      total_steps: total,
      pathway,
    }),

  /** Fired on successful submission. Pathway only — never the answers. */
  formSubmit: (formId: string, pathway: string) => {
    track("form_submit", { form_id: formId, pathway });
    track("generate_lead", { form_id: formId, pathway, value: 1 });
    track("consultation_request", { pathway });
  },

  whatsapp: (location: string) => track("whatsapp_click", { location }),
  phone: (location: string) => track("phone_click", { location }),
  email: (location: string) => track("email_click", { location }),
  faqOpen: (question: string, page: string) =>
    track("faq_open", { question: question.slice(0, 90), page }),
  download: (file: string) => track("file_download", { file_name: file }),
  outbound: (url: string) => track("outbound_click", { url }),

  /* --- portal + engagement ------------------------------------------- */
  loginClick: (location: string) => track("login_click", { location }),
  registrationStart: (pathway: string) =>
    track("registration_start", { pathway }),
  registrationComplete: (role: string) => {
    track("registration_complete", { role });
    track("generate_lead", { source: "portal_registration", value: 1 });
  },
  portalLogin: (role: string) => track("portal_login", { role }),
  portalLogout: () => track("portal_logout"),

  popupOpen: (page: string) => track("popup_open", { page }),
  popupClose: (reason: string) => track("popup_close", { reason }),
  popupPathSelected: (pathway: string) =>
    track("popup_path_selected", { pathway }),

  videoPlay: (pathway: string) => track("video_play", { pathway }),
};

/** Which providers are configured — read by <AnalyticsScripts /> */
export const analyticsConfig = {
  gtmId: process.env.NEXT_PUBLIC_GTM_ID,
  ga4Id: process.env.NEXT_PUBLIC_GA4_ID,
  clarityId: process.env.NEXT_PUBLIC_CLARITY_ID,
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  googleAdsId: process.env.NEXT_PUBLIC_GADS_ID,
};

export const hasAnalytics = Object.values(analyticsConfig).some(Boolean);

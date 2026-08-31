import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  images: {
    /**
     * WebP only. AVIF is deliberately NOT offered.
     *
     * Every source here is already an optimised WebP. Re-encoding those to
     * AVIF on demand costs enormously more CPU than it saves in bytes, and
     * once the plates went to 3400x1912 it stopped being a trade-off and
     * became a hang: the same request served WebP in 0.16s and had still not
     * produced AVIF after 300 seconds.
     *
     * Chrome sends `Accept: image/avif,...` first, so that path is what real
     * visitors get — the hero simply never finished loading. Measured, not
     * assumed; see the note in README under Design system.
     */
    formats: ["image/webp"],
    deviceSizes: [360, 390, 414, 768, 1024, 1280, 1440, 1920],
    imageSizes: [64, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,

    /**
     * Google review author avatars are the only remote images on the site.
     * Scoped to Google's own photo hosts so this cannot become a general
     * open proxy for arbitrary third-party URLs.
     */
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Generated brand assets are content-stable and safe to cache hard.
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

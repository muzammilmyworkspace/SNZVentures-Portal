import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt =
  "SnZ Ventures — European Gateway for Business, Fintech & Talent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Default social card. Drawn from brand tokens rather than a static export so
 * it stays in sync if the palette changes.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #060B18 0%, #0E1932 55%, #1E2D56 100%)",
          padding: "68px 72px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Brand glow */}
        <div
          style={{
            position: "absolute",
            width: 620,
            height: 620,
            right: -180,
            top: -220,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(122,191,64,0.30) 0%, rgba(122,191,64,0) 70%)",
            display: "flex",
          }}
        />

        {/* Mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 9999,
              background: "#FFFFFF",
              border: "3px solid #1E2D56",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "#7ABF40",
            }}
          >
            SnZ
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 27,
                fontWeight: 600,
                color: "#FFFFFF",
                letterSpacing: "-0.02em",
              }}
            >
              SnZ Ventures
            </div>
            <div
              style={{
                fontSize: 15,
                color: "#8B9CC4",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginTop: 3,
              }}
            >
              Vilnius · Lithuania
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.045em",
              lineHeight: 1.04,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Your next opportunity</span>
            <span style={{ color: "#7ABF40" }}>has no borders.</span>
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#C0CADE",
              marginTop: 22,
              maxWidth: 880,
              lineHeight: 1.4,
            }}
          >
            Company formation, fintech licensing, international recruitment and
            investor relocation — across all 27 EU member states.
          </div>
        </div>

        {/* Footer rule */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderTop: "1px solid rgba(255,255,255,0.14)",
            paddingTop: 22,
          }}
        >
          <div
            style={{
              width: 34,
              height: 4,
              background: "#7ABF40",
              borderRadius: 2,
              display: "flex",
            }}
          />
          <div style={{ fontSize: 19, color: "#8B9CC4" }}>snzventures.com</div>
        </div>
      </div>
    ),
    size
  );
}

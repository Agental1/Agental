import { ImageResponse } from "next/og";
import { MARK_BLUE, MARK_INK, MARK_VIEWBOX } from "@/components/brand/logo";

/**
 * Apple touch icon: the monogram at the 180px iOS asks for, on white with no
 * rounding (iOS rounds the corners itself). Separate from icon.tsx because iOS
 * ignores the generic one and falls back to a screenshot of the page.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <svg width="132" height="132" viewBox={MARK_VIEWBOX}>
          {MARK_BLUE.map((points) => (
            <polygon key={points} fill="#246bfe" points={points} />
          ))}
          <polygon fill="#0b0f1a" points={MARK_INK} />
        </svg>
      </div>
    ),
    size
  );
}

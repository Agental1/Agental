import { ImageResponse } from "next/og";

/**
 * Apple touch icon — the same four-point mark at the 180px iOS asks for.
 *
 * Separate from icon.tsx because iOS ignores the generic one and falls back to
 * a screenshot of the page when this is missing, which is how "Add to home
 * screen" ends up showing a blurry crop of the header.
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
          background: "#f8f4ec",
        }}
      >
        <svg width="106" height="148" viewBox="0 0 100 140">
          <path
            d="M50 4 Q56 58 90 70 Q56 82 50 136 Q44 82 10 70 Q44 58 50 4 Z"
            fill="#6e4527"
          />
        </svg>
      </div>
    ),
    size
  );
}

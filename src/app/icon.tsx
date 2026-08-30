import { ImageResponse } from "next/og";

/**
 * App icon, drawn from the design tokens rather than shipped as a binary.
 *
 * public/ held only the create-next-app default SVGs, so there was no brand
 * asset to point at. Generating it means the mark can never drift from the
 * palette in globals.css, and there is no file to remember to regenerate.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
        <svg width="300" height="420" viewBox="0 0 100 140">
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

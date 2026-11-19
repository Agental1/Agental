import { ImageResponse } from "next/og";

/**
 * App icon, drawn in code so it follows the palette in globals.css: the
 * stand-in A monogram on the accent gradient (see components/brand/logo.tsx).
 * It is replaced by the PNG set under /brand once the logo files are in.
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
          background: "linear-gradient(135deg, #246bfe, #1648c4)",
        }}
      >
        <svg width="512" height="512" viewBox="0 0 48 48">
          <path fill="#ffffff" d="M20.6 11h6.8l9.1 26h-6.3l-1.7-5.4h-9.2L17.6 37h-6.1L20.6 11Zm.3 15.8h6.1L24 17l-3.1 9.8Z" />
        </svg>
      </div>
    ),
    size
  );
}

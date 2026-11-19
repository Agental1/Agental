import { ImageResponse } from "next/og";
import { MARK_BLUE, MARK_BLUE_SOLID, MARK_INK, MARK_VIEWBOX } from "@/components/brand/logo";

/**
 * App icons, drawn from the monogram's own shapes (components/brand/logo.tsx)
 * so they cannot drift from the logo on the page: 32px for the browser tab,
 * 192 and 512px for "Add to home screen". The 32px one drops the two cuts in
 * the blue leg, which would close up at that size.
 */
export const contentType = "image/png";

const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((px) => ({
    id: String(px),
    size: { width: px, height: px },
    contentType,
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id) || 32;
  const glyph = Math.round(px * 0.8);
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
          borderRadius: px * 0.22,
        }}
      >
        <svg width={glyph} height={glyph} viewBox={MARK_VIEWBOX}>
          {(px <= 32 ? [MARK_BLUE_SOLID] : MARK_BLUE).map((points) => (
            <polygon key={points} fill="#246bfe" points={points} />
          ))}
          <polygon fill="#0b0f1a" points={MARK_INK} />
        </svg>
      </div>
    ),
    { width: px, height: px }
  );
}

import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/routing";

/**
 * Shared Open Graph card for every page under [locale].
 *
 * Next resolves this per route segment and merges the result into each page's
 * metadata, so seo() deliberately does NOT set `images` — one file covers the
 * whole tree, in all three locales, instead of a hand-kept path per page.
 *
 * public/ still holds only the create-next-app default SVGs, so there is no
 * brand asset to point at; the card is drawn from the design tokens instead,
 * which also means it can never fall out of sync with a static file nobody
 * remembers to regenerate.
 */
export const alt = "Agental";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  // Next 16 hands params in as a Promise, including here. Destructuring it
  // synchronously silently yields undefined, so every locale rendered the
  // French card — identical bytes, no error, nothing to notice in a build log.
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "common" });

  // Talents skin (globals.css): crème ground, espresso ink, cognac accent.
  const CREME = "#f8f4ec";
  const ESPRESSO = "#3a2f26";
  const COGNAC = "#a96b3c";
  const TAUPE = "#9a8b76";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREME,
          color: ESPRESSO,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <svg width="72" height="100" viewBox="0 0 100 140">
          <path
            d="M50 4 Q56 58 90 70 Q56 82 50 136 Q44 82 10 70 Q44 58 50 4 Z"
            fill={COGNAC}
          />
        </svg>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: 940,
            }}
          >
            {t("meta.description")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 30, color: COGNAC, fontWeight: 600 }}>
              Agental
            </div>
            <div style={{ fontSize: 26, color: TAUPE }}>
              {locale.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}

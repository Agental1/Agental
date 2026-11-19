import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing, toLocale } from "@/i18n/routing";

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
/**
 * Les routes de metadonnees n'heritent PAS du generateStaticParams du layout.
 * Sans celui-ci, la carte OG etait `ƒ` dans la sortie de build : satori et resvg
 * rendaient trois images fixes de 1200x630 a chaque partage, dans une fonction,
 * a froid. Les robots des reseaux abandonnent bien avant l'hebergeur.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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

  // The Talent theme from globals.css: white running to pale blue, near-black
  // text, the accent on the monogram. The card has to follow the page it
  // links to; nobody loads their own OG image, so drift here goes unnoticed.
  //
  // Chinese glyphs are not in the default Satori font. ImageResponse fetches a
  // Noto subset for them from Google Fonts at build time, so /zh's card needs
  // network access during the build (Vercel has it).
  const INK = "#0b0f1a";
  const SLATE = "#4a5468";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(180deg, #ffffff 0%, #dceaff 100%)",
          color: INK,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            display: "flex",
            borderRadius: 26,
            background: "linear-gradient(135deg, #246bfe, #1648c4)",
          }}
        >
          <svg width="96" height="96" viewBox="0 0 48 48">
            <path fill="#ffffff" d="M20.6 11h6.8l9.1 26h-6.3l-1.7-5.4h-9.2L17.6 37h-6.1L20.6 11Zm.3 15.8h6.1L24 17l-3.1 9.8Z" />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: 940,
            }}
          >
            {t("meta.description")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 30, color: INK, fontWeight: 700 }}>
              Agental
            </div>
            <div style={{ fontSize: 26, color: SLATE }}>
              {locale.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}

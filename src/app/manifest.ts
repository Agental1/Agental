import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Neither this nor an app icon existed, so "Add to home screen" produced an
 * unnamed entry with a blank tile — the mobile-conformance defect nobody
 * measures because it only shows up outside the browser.
 *
 * Single-locale on purpose: a manifest is per-origin, not per-route, so it
 * cannot vary with the locale. It uses the default locale's wording (English).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agental",
    short_name: "Agental",
    description:
      "The first talent agency built around AI from day one. A real regulated agent, with AI working for you.",
    start_url: "/en/talents",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#246bfe",
    lang: "en",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}

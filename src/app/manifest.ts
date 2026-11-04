import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Neither this nor an app icon existed, so "Add to home screen" produced an
 * unnamed entry with a blank tile — the mobile-conformance defect nobody
 * measures because it only shows up outside the browser.
 *
 * Single-locale on purpose: a manifest is per-origin, not per-route, so it
 * cannot vary with /fr, /en or /es. The default locale's wording is used, and
 * the start URL points at the French entry the proxy would negotiate anyway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agental",
    short_name: "Agental",
    description:
      "La première agence artistique nativement augmentée par IA. Un vrai agent régulé, une IA qui travaille pour toi.",
    start_url: "/en/talents",
    display: "standalone",
    background_color: "#f8f4ec",
    theme_color: "#6e4527",
    lang: "en",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}

/**
 * Charte graphique — hex → token mapping.
 * Used by the extraction pipeline to re-tokenize the mockups' inline hex colors
 * back onto named design tokens (see src/app/globals.css).
 */
export const PALETTE: Record<string, string> = {
  // Neutres
  /**
   * blancchaud sits 10.4 away from #ffffff in RGB and 13.9 from crème, so
   * `nearestToken`'s tolerance of 12 silently resolved it to `white` and threw
   * the warm tint away. It needs its own entry, not a nearest-match.
   */
  "#fffcf5": "blancchaud",
  "#f8f4ec": "creme",
  "#ede4d5": "ivoire",
  "#cdbfa8": "greige",
  "#9a8b76": "taupe",
  "#6b5d4c": "brungrise",
  "#3a2f26": "espresso",
  "#241c16": "noirchaud",
  "#ffffff": "white",
  "#fff": "white",
  "#000000": "black",
  "#000": "black",
  // Bruns chauds
  "#c68a5b": "camel",
  "#a96b3c": "cognac",
  "#6e4527": "chocolat",
  // Marines
  "#3c5a7a": "ardoise",
  "#1f3a5c": "marine",
  "#142942": "marineprof",
  "#0e1d30": "encre",
  // Oranges
  "#f0a06a": "abricot",
  "#de6b34": "orangebrule",
  "#b24e22": "terracotta",
  // Verts
  "#8fa588": "sauge",
  "#3f5e4c": "bouteille",
  "#263b2e": "foret",
  // Sémantiques
  "#2e7d5b": "succes",
  "#c9821e": "alerte",
  "#c0432e": "erreur",
};

/** Expand a 3-digit hex (#abc) to 6-digit (#aabbcc), lowercased. */
export function normalizeHex(hex: string): string {
  let h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) {
    h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = normalizeHex(hex);
  const m = /^#([0-9a-f]{6})$/.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PALETTE_RGB = Object.entries(PALETTE)
  .filter(([hex]) => hex.length === 7)
  .map(([hex, token]) => ({ hex, token, rgb: hexToRgb(hex)! }));

/** Exact token for a hex, or null. */
export function tokenForHex(hex: string): string | null {
  return PALETTE[normalizeHex(hex)] ?? null;
}

/**
 * Nearest token within a small tolerance (euclidean RGB distance).
 * Returns { token, distance } or null when nothing is close enough.
 */
export function nearestToken(
  hex: string,
  maxDistance = 12
): { token: string; distance: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best: { token: string; distance: number } | null = null;
  for (const p of PALETTE_RGB) {
    const d = Math.sqrt(
      (rgb[0] - p.rgb[0]) ** 2 +
        (rgb[1] - p.rgb[1]) ** 2 +
        (rgb[2] - p.rgb[2]) ** 2
    );
    if (best === null || d < best.distance) best = { token: p.token, distance: d };
  }
  if (best && best.distance <= maxDistance) return best;
  return null;
}

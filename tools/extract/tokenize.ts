/**
 * Re-tokenize raw colors in extracted HTML back onto charte tokens.
 * Replaces hex and rgb/rgba colors with `var(--token)` (or a color-mix for
 * alpha), and reports coverage so off-palette drift is visible for review.
 */
import { normalizeHex, tokenForHex, nearestToken } from "./palette";

export interface TokenizeReport {
  total: number;
  mapped: number;
  coverage: number; // 0..1
  misses: { color: string; count: number }[];
}

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function resolve(hex: string): string | null {
  return tokenForHex(hex) ?? nearestToken(hex)?.token ?? null;
}

export function tokenize(html: string): {
  html: string;
  report: TokenizeReport;
} {
  let total = 0;
  let mapped = 0;
  const misses = new Map<string, number>();
  const miss = (c: string) => misses.set(c, (misses.get(c) ?? 0) + 1);

  // Pass 1 — hex colors
  let out = html.replace(HEX_RE, (m) => {
    total++;
    const token = resolve(normalizeHex(m));
    if (token) {
      mapped++;
      return `var(--${token})`;
    }
    miss(normalizeHex(m));
    return m;
  });

  // Pass 2 — rgb()/rgba()
  out = out.replace(RGB_RE, (m, r, g, b, a) => {
    total++;
    const hex = rgbToHex(+r, +g, +b);
    const token = resolve(hex);
    if (!token) {
      miss(m);
      return m;
    }
    mapped++;
    const alpha = a === undefined ? 1 : parseFloat(a);
    if (alpha >= 0.999) return `var(--${token})`;
    const pct = Math.round(alpha * 100);
    return `color-mix(in srgb, var(--${token}) ${pct}%, transparent)`;
  });

  const missArr = [...misses.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count);

  return {
    html: out,
    report: {
      total,
      mapped,
      coverage: total === 0 ? 1 : mapped / total,
      misses: missArr,
    },
  };
}

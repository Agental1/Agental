/**
 * The 9 SEO casting-type landings. STRUCTURE ONLY — no copy.
 *
 * Every string (name, h1, tagline, audience, cachet unit) lives in
 * messages/<locale>/talents.json under `castingTypes.<slug>`. Inlining French
 * here is what made /en/castings/* serve English chrome around a French body:
 * the pages read ct.h1 and ct.tagline straight from this file, so the landings
 * were monolingual by construction.
 *
 * Fees stay numeric so Intl.NumberFormat can render them per locale — a French
 * "800–3 000 €" is not how a Spanish or English reader expects to see money.
 * `createurs` genuinely has no figure, hence the optional fields: the display
 * falls back to a translated "Varies".
 */

export type CachetUnit = "day" | "session" | "project";

/**
 * Slugs as a literal union, not `string`.
 *
 * This is what makes t(`${type.slug}.name`) typecheck against the message
 * files: with a plain string the key is unverifiable, so a slug renamed here
 * and not in messages/<locale>/talents.json would compile fine and render an
 * empty <h1> at runtime, on one of eight pages, in one of three locales.
 */
export type CastingTypeSlug =
  | "figuration"
  | "silhouette"
  | "seconds-roles"
  | "publicite"
  | "photo"
  | "voix-doublage"
  | "enfants"
  | "createurs"
  | "performeurs";

export interface CastingType {
  slug: CastingTypeSlug;
  /** Lower bound in euros. Absent when the fee is project-dependent. */
  cachetMin?: number;
  /** Upper bound in euros. Absent when the fee is project-dependent. */
  cachetMax?: number;
  /** Which translated unit label to render next to the amount. */
  cachetUnit: CachetUnit;
  /** Whether the reinforced minors framework applies prominently. */
  minors?: boolean;
}

export const CASTING_TYPES: CastingType[] = [
  { slug: "figuration", cachetMin: 80, cachetMax: 180, cachetUnit: "day" },
  { slug: "silhouette", cachetMin: 100, cachetMax: 250, cachetUnit: "day" },
  { slug: "seconds-roles", cachetMin: 350, cachetMax: 800, cachetUnit: "day" },
  { slug: "publicite", cachetMin: 800, cachetMax: 3000, cachetUnit: "day" },
  { slug: "photo", cachetMin: 200, cachetMax: 600, cachetUnit: "day" },
  { slug: "voix-doublage", cachetMin: 200, cachetMax: 800, cachetUnit: "session" },
  { slug: "enfants", cachetMin: 80, cachetMax: 800, cachetUnit: "day", minors: true },
  { slug: "createurs", cachetUnit: "project" },
  /**
   * Ninth landing, added with the New LP redesign. The mockups merge figuration
   * and silhouette into one page and add this; we keep both existing slugs —
   * /castings/silhouette is a live indexed URL and dropping it would trade
   * earned ranking for tidiness — and add performeurs alongside.
   *
   * No fee range: it swings with the discipline, so it falls back to the
   * translated "Variable" label the same way createurs does.
   */
  { slug: "performeurs", cachetUnit: "project" },
];

export const CASTING_TYPE_SLUGS = CASTING_TYPES.map((t) => t.slug);

export function getCastingType(slug: string): CastingType | undefined {
  return CASTING_TYPES.find((t) => t.slug === slug);
}

/**
 * Fee range for display, formatted for the locale.
 *
 * Slugs never change with locale (translating them would break the SEO already
 * earned and every inbound link), but the money does: en-US wants "€800–€3,000"
 * where fr-FR wants "800–3 000 €".
 */
export function formatCachet(
  type: CastingType,
  locale: string,
  variableLabel: string
): string {
  if (type.cachetMin === undefined || type.cachetMax === undefined) {
    return variableLabel;
  }
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  return `${money.format(type.cachetMin)}–${money.format(type.cachetMax)}`;
}

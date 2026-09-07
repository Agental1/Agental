/**
 * Locale-matched portraits. STRUCTURE ONLY — no copy.
 *
 * Every caption lives in messages/<locale>/talents.json under `hero.collage`,
 * for the same reason casting-types.ts
 * keeps its copy there: inlining French here is what makes /en and /es serve
 * English chrome around a French body.
 *
 * Static imports rather than /public string paths, on purpose:
 *   - next/image gets intrinsic width/height, so no layout shift and no
 *     hand-maintained dimension numbers,
 *   - the URL is content-hashed and immutable,
 *   - a deleted or renamed file is a BUILD ERROR instead of a 404 nobody
 *     notices. public/ currently holds five unreferenced create-next-app SVGs,
 *     which is exactly that failure mode.
 *
 * The files are derivatives. Regenerate with `bun run assets:portraits`; the
 * sources are gitignored and the selection rationale (including the fact that
 * the FR and ES source filenames are shuffled against their contents) lives in
 * tools/assets/portraits.ts.
 */
import type { StaticImageData } from "next/image";
import type { Locale } from "@/i18n/routing";

import frHero1 from "@/assets/portraits/fr/hero-1.webp";
import frHero2 from "@/assets/portraits/fr/hero-2.webp";
import frHero3 from "@/assets/portraits/fr/hero-3.webp";
import frHero4 from "@/assets/portraits/fr/hero-4.webp";
import frEnfant from "@/assets/portraits/fr/age-enfant.webp";
import frAdolescent from "@/assets/portraits/fr/age-adolescent.webp";
import frJeuneAdulte from "@/assets/portraits/fr/age-jeune-adulte.webp";
import frAdulte from "@/assets/portraits/fr/age-adulte.webp";
import frSenior from "@/assets/portraits/fr/age-senior.webp";
import frSeniorPlus from "@/assets/portraits/fr/age-senior-plus.webp";

import enHero1 from "@/assets/portraits/en/hero-1.webp";
import enHero2 from "@/assets/portraits/en/hero-2.webp";
import enHero3 from "@/assets/portraits/en/hero-3.webp";
import enHero4 from "@/assets/portraits/en/hero-4.webp";
import enEnfant from "@/assets/portraits/en/age-enfant.webp";
import enAdolescent from "@/assets/portraits/en/age-adolescent.webp";
import enJeuneAdulte from "@/assets/portraits/en/age-jeune-adulte.webp";
import enAdulte from "@/assets/portraits/en/age-adulte.webp";
import enSenior from "@/assets/portraits/en/age-senior.webp";
import enSeniorPlus from "@/assets/portraits/en/age-senior-plus.webp";

import esHero1 from "@/assets/portraits/es/hero-1.webp";
import esHero2 from "@/assets/portraits/es/hero-2.webp";
import esHero3 from "@/assets/portraits/es/hero-3.webp";
import esHero4 from "@/assets/portraits/es/hero-4.webp";
import esEnfant from "@/assets/portraits/es/age-enfant.webp";
import esAdolescent from "@/assets/portraits/es/age-adolescent.webp";
import esJeuneAdulte from "@/assets/portraits/es/age-jeune-adulte.webp";
import esAdulte from "@/assets/portraits/es/age-adulte.webp";
import esSenior from "@/assets/portraits/es/age-senior.webp";
import esSeniorPlus from "@/assets/portraits/es/age-senior-plus.webp";

/**
 * Age bands, ascending. A literal union for the same reason
 * `CastingTypeSlug` is one: it makes `t(`ages.${band}`)` checkable against the
 * message files, so a band renamed here and not there fails the build instead
 * of rendering an empty caption on one of three locales.
 */
export type AgeBand =
  | "enfant"
  | "adolescent"
  | "jeune-adulte"
  | "adulte"
  | "senior"
  | "senior-plus";

export interface LocalePortraits {
  /** Four hero-collage tiles, 900x1125. Index maps to `hero.collage[i]`. */
  hero: StaticImageData[];
  ages: Record<AgeBand, StaticImageData>;
}

/**
 * Keyed by Locale, so adding a fourth locale to `routing.locales` fails the
 * typecheck until its portraits exist — rather than rendering an empty collage.
 */
export const PORTRAITS: Record<Locale, LocalePortraits> = {
  fr: {
    hero: [frHero1, frHero2, frHero3, frHero4],
    ages: {
      enfant: frEnfant,
      adolescent: frAdolescent,
      "jeune-adulte": frJeuneAdulte,
      adulte: frAdulte,
      senior: frSenior,
      "senior-plus": frSeniorPlus,
    },
  },
  en: {
    hero: [enHero1, enHero2, enHero3, enHero4],
    ages: {
      enfant: enEnfant,
      adolescent: enAdolescent,
      "jeune-adulte": enJeuneAdulte,
      adulte: enAdulte,
      senior: enSenior,
      "senior-plus": enSeniorPlus,
    },
  },
  es: {
    hero: [esHero1, esHero2, esHero3, esHero4],
    ages: {
      enfant: esEnfant,
      adolescent: esAdolescent,
      "jeune-adulte": esJeuneAdulte,
      adulte: esAdulte,
      senior: esSenior,
      "senior-plus": esSeniorPlus,
    },
  },
};

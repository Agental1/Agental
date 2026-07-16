/**
 * The 8 SEO casting-type landings (Talents side, tutoiement).
 * FR content is inlined here for V1; structure stays i18n-ready.
 */
export interface CastingType {
  slug: string;
  name: string;
  h1: string;
  tagline: string;
  audience: string;
  cachet: string;
  cachetUnit: string;
  /** Whether the reinforced minors framework applies prominently. */
  minors?: boolean;
}

export const CASTING_TYPES: CastingType[] = [
  {
    slug: "figuration",
    name: "Figuration",
    h1: "Casting figuration",
    tagline: "Le point d'entrée du cinéma et de la télé. Aucune expérience requise.",
    audience:
      "Tu veux apparaître à l'écran, découvrir les plateaux et te constituer une première expérience. Tous profils, tous âges, partout en France.",
    cachet: "80–180 €",
    cachetUnit: "/ jour",
  },
  {
    slug: "silhouette",
    name: "Silhouette",
    h1: "Casting silhouette",
    tagline: "Un cran au-dessus de la figuration : un geste, une présence remarquée.",
    audience:
      "Tu as une présence, une allure ou une action précise à jouer à l'image. Un rôle muet mais visible, souvent mieux rémunéré que la figuration.",
    cachet: "100–250 €",
    cachetUnit: "/ jour",
  },
  {
    slug: "seconds-roles",
    name: "Seconds rôles",
    h1: "Casting seconds rôles",
    tagline: "Du texte, un personnage, des séries et des longs métrages.",
    audience:
      "Tu joues, tu as (ou construis) une petite expérience, et tu veux décrocher des rôles parlants dans les séries, la fiction et le cinéma.",
    cachet: "350–800 €",
    cachetUnit: "/ jour",
  },
  {
    slug: "publicite",
    name: "Publicité",
    h1: "Casting publicité",
    tagline: "Les tournages les mieux payés, pour tous les profils.",
    audience:
      "Visage, famille, sportif, senior, enfant, main experte… La pub cherche du vrai, pas des mannequins. Des cachets élevés et des droits d'image négociés.",
    cachet: "800–3 000 €",
    cachetUnit: "/ jour",
  },
  {
    slug: "photo",
    name: "Photo",
    h1: "Casting photo",
    tagline: "Campagnes, catalogues, éditoriaux : ton image, valorisée.",
    audience:
      "Tu es à l'aise devant l'objectif pour des shootings commerciaux ou éditoriaux. Des visages authentiques, de tous types et de tous âges.",
    cachet: "200–600 €",
    cachetUnit: "/ jour",
  },
  {
    slug: "voix-doublage",
    name: "Voix & doublage",
    h1: "Casting voix et doublage",
    tagline: "Ta voix suffit : pub, doublage, narration, e-learning.",
    audience:
      "Tu as une voix qui porte, un accent, une langue ou un timbre particulier. Le travail se fait en studio, souvent sans jamais te déplacer loin.",
    cachet: "200–800 €",
    cachetUnit: "/ séance",
  },
  {
    slug: "enfants",
    name: "Enfants & ados",
    h1: "Casting enfants et ados",
    tagline: "Un cadre protecteur strict, pour jouer en toute sécurité.",
    audience:
      "Ton enfant veut tourner ? Figuration, pub, séries : les opportunités existent, encadrées par un dispositif légal protecteur que nous appliquons à la lettre.",
    cachet: "80–800 €",
    cachetUnit: "/ jour",
    minors: true,
  },
  {
    slug: "createurs",
    name: "Créateurs de contenu",
    h1: "Casting créateurs de contenu",
    tagline: "Ton audience et ton naturel sont un atout de casting.",
    audience:
      "Tu crées déjà du contenu et tu veux monétiser ta présence : placements, campagnes de marque, formats hybrides. On structure et on négocie pour toi.",
    cachet: "Variable",
    cachetUnit: "selon projet",
  },
];

export const CASTING_TYPE_SLUGS = CASTING_TYPES.map((t) => t.slug);

export function getCastingType(slug: string): CastingType | undefined {
  return CASTING_TYPES.find((t) => t.slug === slug);
}

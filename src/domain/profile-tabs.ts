import type { MissingItem, ProfileGap } from "./completeness";

/**
 * Tab ids of the profile editor (/talents/app/profil). The dashboard deep
 * links to them with ?tab=, and that value comes from the URL, so it is
 * checked against this list before it reaches the Tabs component.
 */
export const PROFILE_TABS = ["identite", "physique", "medias", "preferences"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const DEFAULT_PROFILE_TAB: ProfileTab = "identite";

export function parseProfileTab(raw: string | string[] | undefined): ProfileTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Round 8 merged Specialties into Preferences; old links land there.
  if (value === "specialites") return "preferences";
  return (PROFILE_TABS as readonly string[]).includes(value ?? "")
    ? (value as ProfileTab)
    : DEFAULT_PROFILE_TAB;
}

/** Where each optional item is added. */
export const GAP_TAB: Record<ProfileGap, ProfileTab> = {
  video: "medias",
  links: "identite",
  productions: "medias",
  otherMedia: "medias",
  stageName: "identite",
};

export function profileTabHref(tab: ProfileTab): string {
  return `/talents/app/profil?tab=${tab}`;
}

/**
 * The field a deep link opens, per missing item. `focus` is the value of the
 * `data-field` attribute the profile editor puts on the field's wrapper, and
 * it comes from the URL, so it is checked against this list too.
 */
export const ITEM_TARGET: Record<MissingItem | ProfileGap, { tab: ProfileTab; focus: string }> = {
  legalName: { tab: "identite", focus: "legalName" },
  birthDate: { tab: "identite", focus: "birthDate" },
  gender: { tab: "identite", focus: "gender" },
  city: { tab: "identite", focus: "city" },
  phone: { tab: "identite", focus: "phone" },
  bio: { tab: "identite", focus: "bio" },
  languages: { tab: "identite", focus: "languages" },
  height: { tab: "physique", focus: "height" },
  build: { tab: "physique", focus: "build" },
  hair: { tab: "physique", focus: "hair" },
  eyes: { tab: "physique", focus: "eyes" },
  photos: { tab: "medias", focus: "media-SELF" },
  workTypes: { tab: "preferences", focus: "projectTypes" },
  ageRange: { tab: "preferences", focus: "ageRange" },
  compensation: { tab: "preferences", focus: "compensation" },
  dayRate: { tab: "preferences", focus: "compensation" },
  stageName: { tab: "identite", focus: "stageName" },
  links: { tab: "identite", focus: "imdbUrl" },
  video: { tab: "medias", focus: "media-VIDEOS" },
  productions: { tab: "medias", focus: "media-PRODUCTIONS" },
  otherMedia: { tab: "medias", focus: "media-OTHER" },
};

export const PROFILE_FOCUS_FIELDS: readonly string[] = [
  ...new Set(Object.values(ITEM_TARGET).map((t) => t.focus)),
];

export function parseProfileFocus(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && PROFILE_FOCUS_FIELDS.includes(value) ? value : undefined;
}

/** Where a missing item is fixed: the tab, with the field focused. */
export function itemHref(item: MissingItem | ProfileGap): string {
  const { tab, focus } = ITEM_TARGET[item];
  return `/talents/app/profil?tab=${tab}&focus=${focus}`;
}

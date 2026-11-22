import type { MissingItem, ProfileGap } from "./completeness";

/**
 * Tab ids of the profile editor (/talents/app/profil). The dashboard deep
 * links to them with ?tab=, and that value comes from the URL, so it is
 * checked against this list before it reaches the Tabs component.
 */
export const PROFILE_TABS = [
  "identite",
  "physique",
  "medias",
  "specialites",
  "preferences",
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const DEFAULT_PROFILE_TAB: ProfileTab = "identite";

export function parseProfileTab(raw: string | string[] | undefined): ProfileTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (PROFILE_TABS as readonly string[]).includes(value ?? "")
    ? (value as ProfileTab)
    : DEFAULT_PROFILE_TAB;
}

/** Where each missing item is fixed. */
export const GAP_TAB: Record<ProfileGap, ProfileTab> = {
  photos: "medias",
  video: "medias",
  physical: "physique",
  bio: "identite",
  links: "identite",
};

export function profileTabHref(tab: ProfileTab): string {
  return `/talents/app/profil?tab=${tab}`;
}

/**
 * The field a deep link opens, per missing item. `focus` is the value of the
 * `data-field` attribute the profile editor puts on the field's wrapper, and
 * it comes from the URL, so it is checked against this list too.
 */
export const ITEM_TARGET: Record<MissingItem, { tab: ProfileTab; focus: string }> = {
  stageName: { tab: "identite", focus: "stageName" },
  birthDate: { tab: "identite", focus: "birthDate" },
  city: { tab: "identite", focus: "city" },
  bio: { tab: "identite", focus: "bio" },
  links: { tab: "identite", focus: "imdbUrl" },
  specialties: { tab: "specialites", focus: "specialties" },
  photos: { tab: "medias", focus: "media" },
  video: { tab: "medias", focus: "media" },
  height: { tab: "physique", focus: "height" },
  physical: { tab: "physique", focus: "hair" },
};

export const PROFILE_FOCUS_FIELDS: readonly string[] = [
  ...new Set(Object.values(ITEM_TARGET).map((t) => t.focus)),
];

export function parseProfileFocus(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && PROFILE_FOCUS_FIELDS.includes(value) ? value : undefined;
}

/** Where a missing item is fixed: the tab, with the field focused. */
export function itemHref(item: MissingItem): string {
  const { tab, focus } = ITEM_TARGET[item];
  return `/talents/app/profil?tab=${tab}&focus=${focus}`;
}

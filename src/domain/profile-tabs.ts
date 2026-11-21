import type { ProfileGap } from "./completeness";

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

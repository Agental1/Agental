/** The Settings sections, in menu order (round 8b). Each has its own address: ?section=<id>. */
export const SETTINGS_SECTIONS = ["account", "language", "notifications", "privacy", "subscription"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

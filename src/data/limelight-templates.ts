/**
 * The Limelight templates, in the order of `talents.limelight.templates.items`
 * in the message files (names and one-line descriptions live there).
 *
 * `id` is what a saved site stores. Previews are drawn in code with neutral
 * placeholders (initials on a gradient): there are no photos of real people
 * on public pages.
 */
export const LIMELIGHT_TEMPLATES = [
  "marquee",
  "contact-sheet",
  "reel-first",
  "stage-door",
  "voice-booth",
  "studio",
] as const;

export type LimelightTemplateId = (typeof LIMELIGHT_TEMPLATES)[number];

/** What a visitor types in "Try it" before they have an account. */
export interface LimelightDraft {
  v: 1;
  template: LimelightTemplateId;
  name: string;
  headline: string;
}

/** Where the draft waits, on the visitor's device, until an account exists. */
export const LIMELIGHT_DRAFT_KEY = "agental.limelight.draft";

/** yourname.agental.site, from whatever was typed. */
export function siteSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return slug || "yourname";
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Fixed lists of the profile (round 8): gender, hair and eyes.
 *
 * Hair and eye values are stored as the English option label ("Dark brown"),
 * the same kind of text the column held when it was free text, so the agents
 * and the casting views that read `physical.hair` keep working unchanged.
 * The editor translates known values; anything else stays as typed and shows
 * as "Other: <value>". Nobody loses what they wrote.
 */

export const GENDERS = [
  "male",
  "female",
  "trans_male",
  "trans_female",
  "non_binary",
  "other",
  "prefer_not",
] as const;
export type Gender = (typeof GENDERS)[number];

export const HAIR_COLORS = [
  "Black",
  "Dark brown",
  "Brown",
  "Light brown",
  "Auburn",
  "Red",
  "Strawberry blond",
  "Blond",
  "Platinum blond",
  "Gray",
  "White",
  "Salt and pepper",
  "Bald or shaved",
  "Dyed or other",
] as const;

export const HAIR_LENGTHS = [
  "Bald or shaved",
  "Buzz",
  "Short",
  "Medium",
  "Shoulder length",
  "Long",
  "Very long",
] as const;

export const EYE_COLORS = [
  "Brown",
  "Dark brown",
  "Hazel",
  "Amber",
  "Green",
  "Blue",
  "Gray",
  "Heterochromia",
  "Other",
] as const;

/** Message key of an option: "Dark brown" -> "dark_brown". */
export function optionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Spellings that certainly mean one option. Only exact words (after case and
 * spacing are ignored): "brown hair" or "brunette-ish" stay as typed.
 */
const SYNONYMS: Record<string, string> = {
  blonde: "Blond",
  "strawberry blonde": "Strawberry blond",
  "platinum blonde": "Platinum blond",
  grey: "Gray",
  "dark blond": "Blond",
  ginger: "Red",
  bald: "Bald or shaved",
  shaved: "Bald or shaved",
  "salt & pepper": "Salt and pepper",
  "salt-and-pepper": "Salt and pepper",
  "shoulder-length": "Shoulder length",
  "shoulder length": "Shoulder length",
  "very long": "Very long",
  "buzz cut": "Buzz",
  "dark-brown": "Dark brown",
  "light-brown": "Light brown",
  noir: "Black",
  noirs: "Black",
  bruns: "Brown",
  brun: "Brown",
  blonds: "Blond",
  roux: "Red",
  bleus: "Blue",
  bleu: "Blue",
  verts: "Green",
  vert: "Green",
  marron: "Brown",
  gris: "Gray",
  noisette: "Hazel",
};

/**
 * The option a stored value certainly is, or null. Matching ignores case and
 * extra spaces; an unknown value returns null and is kept as typed.
 */
export function matchOption(options: readonly string[], raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!v) return null;
  const direct = options.find((o) => o.toLowerCase() === v);
  if (direct) return direct;
  const syn = SYNONYMS[v];
  return syn && options.includes(syn) ? syn : null;
}

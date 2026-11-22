/**
 * "Accents you can do" (round 8): grouped by region, searchable by any word
 * ("Leb" finds Lebanese), stored by name in physical.accents. Anything else is
 * free text ("Other").
 */
export interface AccentGroup {
  region: string;
  accents: string[];
}

export const ACCENT_GROUPS: AccentGroup[] = [
  {
    region: "United States",
    accents: [
      "General American", "Californian", "Valley", "New York", "Brooklyn", "Bronx", "Boston",
      "New Jersey", "Philadelphia", "Baltimore", "Chicago", "Midwestern", "Minnesotan",
      "Wisconsin", "Southern", "Texan", "Deep South", "Georgia", "Appalachian", "Cajun",
      "New Orleans", "African American English", "Pacific Northwest", "Hawaiian Pidgin",
      "Mid-Atlantic (Transatlantic)",
    ],
  },
  { region: "Canada", accents: ["Standard Canadian", "Newfoundland", "Québécois English", "Maritimes"] },
  {
    region: "United Kingdom and Ireland",
    accents: [
      "Received Pronunciation (RP)", "Standard Southern British", "Cockney", "Estuary",
      "Multicultural London English", "West Country", "Brummie", "Black Country", "Mancunian",
      "Scouse", "Yorkshire", "Geordie", "Lancashire", "Scottish (Standard)", "Glaswegian",
      "Edinburgh", "Welsh", "Irish (Dublin)", "Irish (Rural)", "Northern Irish",
    ],
  },
  {
    region: "Oceania and Africa",
    accents: [
      "General Australian", "Broad Australian", "New Zealand", "South African", "Nigerian",
      "Ghanaian", "Kenyan", "Ugandan", "Zimbabwean", "Ethiopian", "Cameroonian", "Senegalese",
    ],
  },
  { region: "Caribbean", accents: ["Jamaican", "Trinidadian", "Bahamian", "Barbadian", "Haitian"] },
  {
    region: "French",
    accents: [
      "Parisian", "Southern French", "Marseillais", "Belgian", "Swiss French", "Québécois",
      "French Caribbean", "North African French", "West African French",
    ],
  },
  {
    region: "Spanish",
    accents: [
      "Castilian", "Andalusian", "Mexican", "Mexico City", "Northern Mexican", "Chicano",
      "Argentine", "Rioplatense", "Colombian", "Venezuelan", "Cuban", "Puerto Rican",
      "Dominican", "Chilean", "Peruvian", "Central American", "Spanglish",
    ],
  },
  {
    region: "Portuguese",
    accents: ["Brazilian (Rio)", "Brazilian (São Paulo)", "Brazilian (Northeast)", "European Portuguese", "Angolan"],
  },
  {
    region: "Italian, German, Dutch, Nordic",
    accents: [
      "Standard Italian", "Roman", "Neapolitan", "Sicilian", "Milanese", "Standard German",
      "Bavarian", "Berlin", "Austrian", "Swiss German", "Dutch", "Flemish", "Swedish",
      "Norwegian", "Danish", "Finnish", "Icelandic",
    ],
  },
  {
    region: "Eastern Europe",
    accents: [
      "Russian", "Ukrainian", "Polish", "Czech", "Slovak", "Romanian", "Hungarian", "Serbian",
      "Croatian", "Bosnian", "Bulgarian", "Albanian", "Greek", "Georgian", "Lithuanian",
    ],
  },
  {
    region: "Middle East and North Africa",
    accents: [
      "Lebanese", "Syrian", "Palestinian", "Jordanian", "Egyptian", "Gulf Arabic", "Saudi",
      "Iraqi", "Yemeni", "Moroccan", "Algerian", "Tunisian", "Libyan", "Israeli Hebrew",
      "Persian (Farsi)", "Turkish", "Armenian", "Kurdish",
    ],
  },
  {
    region: "South Asia",
    accents: ["Indian (Hindi)", "Indian (South)", "Mumbai", "Bengali", "Punjabi", "Pakistani", "Sri Lankan", "Nepali", "Bangladeshi"],
  },
  {
    region: "East and Southeast Asia",
    accents: [
      "Mandarin (Beijing)", "Mandarin (Taiwan)", "Cantonese (Hong Kong)", "Shanghainese",
      "Korean (Seoul)", "Korean (Busan)", "Japanese (Tokyo)", "Kansai", "Filipino",
      "Vietnamese", "Thai", "Indonesian", "Malaysian", "Singaporean", "Cambodian", "Burmese",
    ],
  },
];

export const ACCENTS: string[] = ACCENT_GROUPS.flatMap((g) => g.accents);

/** Does an accent match what was typed? Any word of the name, by prefix. */
export function accentMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name
    .toLowerCase()
    .split(/[\s()/-]+/)
    .some((w) => w.startsWith(q));
}

/**
 * Stored in physical.accents, alone, when the performer chose "I don't do any
 * accents" (round 8b). Shown translated in the app.
 */
export const NO_ACCENTS = "none";

/**
 * "Accents you can do" (round 8; extended in round 10 by region): grouped by region, searchable by any word
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
      "Mid-Atlantic (Transatlantic)", "Southern Californian", "Bay Area", "Long Island", "Pittsburgh", "Upper Midwest", "Inland North", "Ozark", "Tidewater", "Gullah Geechee", "Miami", "Maine", "Rhode Island", "Utah", "Alaskan", "New Mexican", "Tejano",
    ],
  },
  { region: "Canada", accents: ["Standard Canadian", "Newfoundland", "Québécois English", "Maritimes", "Ottawa Valley", "Canadian Prairie", "First Nations English",
    ] },
  {
    region: "United Kingdom and Ireland",
    accents: [
      "Received Pronunciation (RP)", "Standard Southern British", "Cockney", "Estuary",
      "Multicultural London English", "West Country", "Brummie", "Black Country", "Mancunian",
      "Scouse", "Yorkshire", "Geordie", "Lancashire", "Scottish (Standard)", "Glaswegian",
      "Edinburgh", "Welsh", "Irish (Dublin)", "Irish (Rural)", "Northern Irish", "Essex", "Bristolian", "Cornish", "Norfolk", "Nottingham", "Leeds", "Sheffield", "Cumbrian", "Teesside", "Aberdonian", "Highland Scottish", "Valleys Welsh", "North Welsh", "Cork", "Belfast",
    ],
  },
  {
    region: "Oceania",
    accents: [
      "General Australian", "Broad Australian", "Aboriginal Australian English", "New Zealand",
      "Maori English", "Fijian", "Samoan", "Tongan", "Papua New Guinean",
    ],
  },
  {
    region: "Africa",
    accents: [
      "South African", "Afrikaans", "Zulu", "Xhosa", "Nigerian", "Yoruba", "Igbo", "Hausa",
      "Ghanaian", "Kenyan", "Tanzanian", "Ugandan", "Rwandan", "Zimbabwean", "Zambian", "Malawian",
      "Botswanan", "Namibian", "Ethiopian", "Eritrean", "Somali", "Sudanese", "Cameroonian",
      "Congolese", "Senegalese", "Ivorian", "Liberian", "Sierra Leonean",
    ],
  },
  { region: "Caribbean", accents: ["Jamaican", "Trinidadian", "Bahamian", "Barbadian", "Haitian", "Guyanese", "Belizean", "Bermudian", "Grenadian", "St. Lucian", "Vincentian", "Antiguan", "Caymanian",
    ] },
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
      "Dominican", "Chilean", "Peruvian", "Central American", "Spanglish", "Bolivian", "Ecuadorian", "Paraguayan", "Uruguayan", "Guatemalan", "Salvadoran", "Honduran", "Nicaraguan", "Costa Rican", "Panamanian", "Caribbean Colombian", "Paisa", "Canarian", "Galician Spanish", "Catalan Spanish",
    ],
  },
  {
    region: "Portuguese",
    accents: ["Brazilian (Rio)", "Brazilian (São Paulo)", "Brazilian (Northeast)", "European Portuguese", "Angolan", "Mozambican", "Cape Verdean",
    ],
  },
  {
    region: "Italian, German, Dutch, Nordic",
    accents: [
      "Standard Italian", "Roman", "Neapolitan", "Sicilian", "Milanese", "Standard German",
      "Bavarian", "Berlin", "Austrian", "Swiss German", "Dutch", "Flemish", "Swedish",
      "Norwegian", "Danish", "Finnish", "Icelandic", "Tuscan", "Venetian", "Swiss Italian", "Luxembourgish", "Maltese", "Basque", "Catalan", "Alsatian", "Corsican",
    ],
  },
  {
    region: "Eastern Europe",
    accents: [
      "Russian", "Ukrainian", "Polish", "Czech", "Slovak", "Romanian", "Hungarian", "Serbian",
      "Croatian", "Bosnian", "Bulgarian", "Albanian", "Greek", "Georgian", "Lithuanian", "Latvian", "Estonian", "Belarusian", "Slovenian", "Macedonian", "Moldovan", "Chechen",
    ],
  },
  {
    region: "Middle East and North Africa",
    accents: [
      "Lebanese", "Syrian", "Palestinian", "Jordanian", "Egyptian", "Gulf Arabic", "Saudi",
      "Iraqi", "Yemeni", "Moroccan", "Algerian", "Tunisian", "Libyan", "Israeli Hebrew",
      "Persian (Farsi)", "Turkish", "Armenian", "Kurdish", "Emirati", "Kuwaiti", "Qatari", "Omani", "Bahraini", "Assyrian", "Azerbaijani", "Bedouin", "Sudanese Arabic",
    ],
  },
  {
    region: "South Asia",
    accents: ["Indian (Hindi)", "Indian (South)", "Mumbai", "Bengali", "Punjabi", "Pakistani", "Sri Lankan", "Nepali", "Bangladeshi", "Tamil", "Telugu", "Malayalam", "Gujarati", "Marathi", "Urdu", "Kashmiri", "Afghan (Dari)", "Pashto",
    ],
  },
  {
    region: "East and Southeast Asia",
    accents: [
      "Mandarin (Beijing)", "Mandarin (Taiwan)", "Cantonese (Hong Kong)", "Shanghainese",
      "Korean (Seoul)", "Korean (Busan)", "Japanese (Tokyo)", "Kansai", "Filipino",
      "Vietnamese", "Thai", "Indonesian", "Malaysian", "Singaporean", "Cambodian", "Burmese", "Mandarin (Mainland)", "Hokkien", "Teochew", "Tagalog", "Hmong", "Lao", "Mongolian", "Okinawan", "Tibetan", "Kazakh", "Uzbek",
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

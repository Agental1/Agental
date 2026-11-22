/**
 * Profile fields that make a test performer 100% complete (scoreProfile), as
 * agents need since eligibility became automatic. Spread into an
 * `artistProfile: { create: { ... } }`. `key` keeps storage keys unique.
 */
export function completeProfile(key: string, withSpecialty = true) {
  return {
    city: "New York",
    bio: "Trained stage and screen actor.",
    imdbUrl: "https://www.imdb.com/name/nm0000001/",
    physical: JSON.stringify({ heightCm: 170, hair: "brown", languages: [], accents: [] }),
    ...(withSpecialty ? { specialties: { create: [{ kind: "figuration", level: "CONFIRMED" }] } } : {}),
    media: {
      create: [
        { type: "PHOTO", category: "SELF", storageKey: `complete/${key}/self` },
        { type: "VIDEO", category: "VIDEOS", storageKey: `complete/${key}/video` },
        { type: "PHOTO", category: "PRODUCTIONS", storageKey: `complete/${key}/production` },
        { type: "AUDIO", category: "OTHER", storageKey: `complete/${key}/other` },
      ],
    },
  };
}

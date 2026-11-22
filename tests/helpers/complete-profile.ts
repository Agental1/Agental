/**
 * Profile fields that make a test performer 100% complete under the round 8
 * rule (src/domain/completeness.ts), as agents need since eligibility became
 * automatic. Spread into an `artistProfile: { create: { ... } }`. `key` keeps
 * storage keys unique.
 */
export function completeProfile(key: string, withSpecialty = true) {
  return {
    legalFirstName: "Test",
    legalLastName: "Performer",
    gender: "prefer_not",
    city: "New York",
    phone: "+12125550100",
    bio: "Trained stage and screen actor.",
    imdbUrl: "https://www.imdb.com/name/nm0000001/",
    physical: JSON.stringify({ heightCm: 170, hair: "Brown", eyes: "Brown", languages: ["English"], accents: [] }),
    preferences: JSON.stringify({
      v: 2,
      merged: true,
      projectTypes: ["film"],
      playableAgeMin: 20,
      playableAgeMax: 35,
      compensation: "paid_or_unpaid",
    }),
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

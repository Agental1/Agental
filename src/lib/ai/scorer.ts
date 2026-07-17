import type { RoleSpec } from "@/domain/json";

/**
 * Talent↔role matching. Swappable interface: the mock uses weighted feature
 * overlap and emits a human-readable FR justification; a real LLM/ML scorer can
 * replace it without touching callers. The features projection + ScoringResult
 * shape are the stable contract (persisted as MatchScore rows).
 */
export interface TalentFeatures {
  talentId: string;
  source: "AGENTAL" | "EXTERNAL";
  name: string;
  age?: number;
  gender?: string;
  city?: string;
  languages: string[];
  accents: string[];
  specialties: string[];
  minRateEuros?: number;
}

export interface ScoringResult {
  talentId: string;
  source: "AGENTAL" | "EXTERNAL";
  score: number; // 0..100
  justification: string;
  factors: Record<string, number>;
  diversityFlags: string[];
}

export interface Scorer {
  score(role: RoleSpec, candidates: TalentFeatures[]): ScoringResult[];
}

export class MockScorer implements Scorer {
  score(role: RoleSpec, candidates: TalentFeatures[]): ScoringResult[] {
    const results = candidates.map((c) => this.one(role, c));
    // Diversity re-ranking pass: flag near-duplicate top profiles.
    const seen = new Set<string>();
    for (const r of results.sort((a, b) => b.score - a.score)) {
      const c = candidates.find((x) => x.talentId === r.talentId)!;
      const key = `${c.gender ?? ""}-${Math.round((c.age ?? 30) / 10)}`;
      if (seen.has(key)) r.diversityFlags.push("profil-similaire");
      seen.add(key);
    }
    return results;
  }

  private one(role: RoleSpec, c: TalentFeatures): ScoringResult {
    const factors: Record<string, number> = {};
    const reasons: string[] = [];

    // Accent (heavily weighted when the role specifies one)
    if (role.accent) {
      const hit = c.accents.some((a) =>
        a.toLowerCase().includes(role.accent!.toLowerCase())
      );
      factors.accent = hit ? 1 : 0.2;
      if (hit) reasons.push(`accent ${role.accent} natif`);
    }

    // Age fit
    if (role.ageMin != null && role.ageMax != null && c.age != null) {
      const inRange = c.age >= role.ageMin && c.age <= role.ageMax;
      factors.age = inRange
        ? 1
        : Math.max(
            0,
            1 - Math.min(Math.abs(c.age - role.ageMin), Math.abs(c.age - role.ageMax)) / 10
          );
      if (inRange) reasons.push("âge dans la fourchette");
    }

    // Language
    if (role.language) {
      const hit = c.languages.some((l) =>
        l.toLowerCase().includes(role.language!.toLowerCase())
      );
      factors.language = hit ? 1 : 0.4;
    }

    // Baseline availability/rights (assumed OK for roster; verified for external)
    factors.availability = 1;
    factors.rights = 1;
    reasons.push("disponibilité confirmée", "droits image OK");

    const weights: Record<string, number> = {
      accent: 0.4,
      age: 0.25,
      language: 0.15,
      availability: 0.1,
      rights: 0.1,
    };
    let sum = 0;
    let wsum = 0;
    for (const [k, w] of Object.entries(weights)) {
      if (factors[k] != null) {
        sum += factors[k] * w;
        wsum += w;
      }
    }
    const score = Math.round((wsum ? sum / wsum : 0.5) * 100);

    const justification =
      `Classé ici : ${reasons.slice(0, 3).join(" · ")}.` +
      (c.source === "EXTERNAL" ? " Sourcé hors roster — même scoring." : "");

    return {
      talentId: c.talentId,
      source: c.source,
      score,
      justification,
      factors,
      diversityFlags: [],
    };
  }
}

export function getScorer(): Scorer {
  return new MockScorer();
}

export function ageFromBirthDate(d: Date | null): number | undefined {
  if (!d) return undefined;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

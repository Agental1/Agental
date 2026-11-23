import type { RoleSpec } from "@/domain/json";
import { reason, type MatchReason } from "@/domain/match-reason";

/**
 * Talent↔role matching. Swappable interface: the mock uses weighted feature
 * overlap and emits structured reason keys; a real LLM/ML scorer can
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
  /**
   * Why, as keys. Not a sentence: this is persisted and later read in whatever
   * language the reader uses. See src/domain/match-reason.ts.
   */
  reasons: MatchReason[];
  factors: Record<string, number>;
  diversityFlags: string[];
}

export interface Scorer {
  readonly version: string;
  score(role: RoleSpec, candidates: TalentFeatures[]): Promise<ScoringResult[]>;
}

export class MockScorer implements Scorer {
  readonly version = "mock-v1";

  async score(
    role: RoleSpec,
    candidates: TalentFeatures[]
  ): Promise<ScoringResult[]> {
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
    const reasons: MatchReason[] = [];

    // Accent (heavily weighted when the role specifies one)
    if (role.accent) {
      const hit = c.accents.some((a) =>
        a.toLowerCase().includes(role.accent!.toLowerCase())
      );
      factors.accent = hit ? 1 : 0.2;
      if (hit) reasons.push(reason("accentNative", { accent: role.accent }));
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
      if (inRange) reasons.push(reason("ageInRange"));
    }

    // Language
    if (role.language) {
      const hit = c.languages.some((l) =>
        l.toLowerCase().includes(role.language!.toLowerCase())
      );
      factors.language = hit ? 1 : 0.4;
      if (hit) reasons.push(reason("languageMatch"));
    }

    // Baseline availability/rights (assumed OK for roster; verified for external)
    factors.availability = 1;
    factors.rights = 1;
    reasons.push(reason("availability"), reason("imageRights"));

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

    // Cap the "why" at three so a shortlist card stays scannable, then append
    // the off-roster note if it applies — it is a provenance disclosure, not a
    // reason, and must never be the one that gets trimmed.
    const shown = reasons.slice(0, 3);
    if (c.source === "EXTERNAL") shown.push(reason("sourcedOffRoster"));

    return {
      talentId: c.talentId,
      source: c.source,
      score,
      reasons: shown,
      factors,
      diversityFlags: [],
    };
  }
}

/**
 * Select the scorer. The deterministic mock is the default; SCORER=llm selects
 * the Anthropic-backed one. The interface is unchanged either way, so swapping
 * is invisible to callers (Phase 6).
 *
 * SCORER=llm without a key is refused rather than quietly downgraded. The
 * previous version returned the mock in that case, which meant a deployment
 * that believed it had AI matching switched on got deterministic scores with
 * written justifications instead — presented to a casting director as a real
 * match, with nothing anywhere saying otherwise. A missing key is a deployment
 * error, and it says so here rather than being discovered from the results.
 */
export async function getScorer(): Promise<Scorer> {
  // Round 9: the pause switch (Admin > Controls) keeps the deterministic scorer.
  const { isPaused } = await import("@/lib/app-settings");
  if (process.env.SCORER === "llm" && !(await isPaused())) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "SCORER=llm requires ANTHROPIC_API_KEY. Set it, or unset SCORER to " +
          "use the deterministic mock scorer."
      );
    }
    // Lazy import so the SDK loads only when the LLM scorer is selected.
    const { LlmScorer } = await import("./llm-scorer");
    return new LlmScorer(new MockScorer());
  }
  return new MockScorer();
}

export function ageFromBirthDate(d: Date | null): number | undefined {
  if (!d) return undefined;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

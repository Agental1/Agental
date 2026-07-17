import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { RoleSpec } from "@/domain/json";
import type { Scorer, ScoringResult, TalentFeatures } from "./scorer";

/**
 * LLM-backed talent↔role scorer (Anthropic). Same Scorer contract as MockScorer,
 * so runShortlist doesn't change. Falls back to the injected mock on any error
 * or when no API key is configured. Selected via SCORER=llm (see getScorer).
 */

const ResultSchema = z.object({
  results: z.array(
    z.object({
      talentId: z.string(),
      score: z.number().int().min(0).max(100),
      justification: z.string(), // French, human-readable
      factors: z.record(z.string(), z.number()),
      diversityFlags: z.array(z.string()),
    })
  ),
});

export class LlmScorer implements Scorer {
  readonly version = "llm-opus-4.8-v1";
  private client = new Anthropic();

  constructor(private fallback: Scorer) {}

  async score(
    role: RoleSpec,
    candidates: TalentFeatures[]
  ): Promise<ScoringResult[]> {
    try {
      const response = await this.client.messages.parse({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system:
          "Tu es le moteur de matching d'une agence artistique française. " +
          "Pour un rôle donné et une liste de talents, attribue à chacun un score de 0 à 100 " +
          "de pertinence pour le rôle, avec une justification courte et lisible en français " +
          "(« Classé ici : … »). Pondère fortement l'accent demandé, puis l'âge, la langue, " +
          "la disponibilité et les droits. Renvoie aussi `factors` (0..1 par critère) et " +
          "`diversityFlags` (ex. `profil-similaire` si deux profils sont quasi identiques). " +
          "Reste neutre : même barème pour les talents Agental et externes.",
        messages: [
          {
            role: "user",
            content: JSON.stringify({ role, candidates }),
          },
        ],
        output_config: { format: zodOutputFormat(ResultSchema) },
      });

      const parsed = response.parsed_output;
      if (!parsed) return this.fallback.score(role, candidates);

      const byId = new Map(candidates.map((c) => [c.talentId, c.source]));
      return parsed.results
        .filter((r) => byId.has(r.talentId))
        .map((r) => ({
          talentId: r.talentId,
          source: byId.get(r.talentId)!,
          score: r.score,
          justification: r.justification,
          factors: r.factors,
          diversityFlags: r.diversityFlags,
        }));
    } catch {
      // Any failure (no key, rate limit, refusal) → deterministic mock.
      return this.fallback.score(role, candidates);
    }
  }
}

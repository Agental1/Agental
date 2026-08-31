import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { RoleSpec } from "@/domain/json";
import { MatchReason } from "@/domain/match-reason";
import type { Scorer, ScoringResult, TalentFeatures } from "./scorer";

/**
 * LLM-backed talent↔role scorer (Anthropic). Same Scorer contract as MockScorer,
 * so runShortlist doesn't change. Selected via SCORER=llm (see getScorer).
 *
 * It returns reason keys, not prose. Free prose is what an LLM is best at, and
 * giving it up is a real cost — but the explanation is persisted and read later
 * by a casting director, a colleague, and the talent, each in their own
 * language. A sentence can only be written in one.
 *
 * A runtime failure — rate limit, network, a refusal, a response that does not
 * match the schema — degrades to the injected mock rather than failing a brief
 * in progress. It is logged every time: the previous version swallowed
 * everything silently, so a casting director received deterministic mock scores
 * carrying written justifications, indistinguishable from real matching.
 *
 * Missing configuration is not handled here. Asking for the LLM scorer without
 * a key is a deployment error and getScorer refuses it up front.
 */

const ResultSchema = z.object({
  results: z.array(
    z.object({
      talentId: z.string(),
      score: z.number().int().min(0).max(100),
      reasons: z.array(MatchReason).max(4),
      factors: z.record(z.string(), z.number()),
      diversityFlags: z.array(z.string()),
    })
  ),
});

export class LlmScorer implements Scorer {
  readonly version = "llm-opus-5-v1";
  private client = new Anthropic();

  constructor(private fallback: Scorer) {}

  async score(
    role: RoleSpec,
    candidates: TalentFeatures[]
  ): Promise<ScoringResult[]> {
    try {
      const response = await this.client.messages.parse({
        model: "claude-opus-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system:
          "Tu es le moteur de matching d'une agence artistique. Pour un rôle et " +
          "une liste de talents, attribue à chacun un score de 0 à 100. Pondère " +
          "fortement l'accent demandé, puis l'âge, la langue, la disponibilité et " +
          "les droits.\n\n" +
          "N'écris aucune phrase d'explication. Renvoie `reasons`, au plus quatre, " +
          "choisies dans cette liste fermée :\n" +
          "- accentNative — l'accent demandé est natif. values: { accent }\n" +
          "- ageInRange — l'âge tombe dans la fourchette\n" +
          "- languageMatch — la langue demandée est maîtrisée\n" +
          "- availability — disponibilité confirmée\n" +
          "- imageRights — droits image en règle\n" +
          "- sourcedOffRoster — talent sourcé hors roster\n\n" +
          "Ces clés sont rendues dans la langue du lecteur : une explication " +
          "rédigée serait figée dans une seule langue et lue par des personnes " +
          "qui n'y sont pas.\n\n" +
          "Renvoie aussi `factors` (0..1 par critère) et `diversityFlags` " +
          "(ex. `profil-similaire` si deux profils sont quasi identiques). " +
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
      if (!parsed) {
        // No parsed output means the model refused or returned something the
        // schema rejected. stop_reason tells which; both are worth seeing.
        console.warn(
          `[scorer] no structured output (stop_reason: ${response.stop_reason}) — falling back to mock`
        );
        return this.fallback.score(role, candidates);
      }

      const byId = new Map(candidates.map((c) => [c.talentId, c.source]));
      return parsed.results
        .filter((r) => byId.has(r.talentId))
        .map((r) => ({
          talentId: r.talentId,
          source: byId.get(r.talentId)!,
          score: r.score,
          reasons: r.reasons,
          factors: r.factors,
          diversityFlags: r.diversityFlags,
        }));
    } catch (error) {
      console.error(
        "[scorer] LLM scoring failed — falling back to mock:",
        error instanceof Error ? error.message : error
      );
      return this.fallback.score(role, candidates);
    }
  }
}

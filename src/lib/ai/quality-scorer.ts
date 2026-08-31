import talentsMessages from "../../../messages/fr/talents.json";

/**
 * Self-tape quality scoring. Swappable like the match Scorer: the mock derives
 * a score from client-captured framing/light/sound metrics; a real CV/ML
 * scorer can replace it behind the same interface without touching callers.
 */

/**
 * Advice keys, derived from the French message file rather than typed as
 * `string` — same reason as ErrorKey in src/domain/action-result.ts: a key that
 * does not exist fails `bun run typecheck` instead of reaching a talent as a
 * raw path.
 *
 * The scorer returns keys, never sentences. It runs on the server; the advice
 * is read on the client, so a ready sentence would freeze the language at the
 * moment the take was scored. It did: these were five French literals, shown to
 * every talent in every language, after each recording.
 */
export type TipKey =
  `space.selftape.tips.${keyof (typeof talentsMessages)["space"]["selftape"]["tips"]}`;
export interface QualityMetrics {
  framing: number; // 0..1 (subject centered / rule-of-thirds)
  light: number; // 0..1 (exposure adequacy)
  sound: number; // 0..1 (level / clipping)
  durationMs: number;
}

export interface QualityResult {
  score: number; // 0..100
  breakdown: { framing: number; light: number; sound: number };
  tips: TipKey[];
}

export interface QualityScorer {
  score(m: QualityMetrics): QualityResult;
}

export class MockQualityScorer implements QualityScorer {
  score(m: QualityMetrics): QualityResult {
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const framing = clamp(m.framing);
    const light = clamp(m.light);
    const sound = clamp(m.sound);
    // Sound weighted highest — a self-tape lives or dies on audibility.
    const raw = framing * 0.3 + light * 0.3 + sound * 0.4;
    const durationPenalty = m.durationMs < 3000 ? 0.15 : 0;
    const score = Math.round(Math.max(0, raw - durationPenalty) * 100);

    const tips: TipKey[] = [];
    if (framing < 0.6) tips.push("space.selftape.tips.framing");
    if (light < 0.6) tips.push("space.selftape.tips.light");
    if (sound < 0.6) tips.push("space.selftape.tips.sound");
    if (m.durationMs < 3000) tips.push("space.selftape.tips.tooShort");
    if (tips.length === 0) tips.push("space.selftape.tips.excellent");

    return {
      score,
      breakdown: {
        framing: Math.round(framing * 100),
        light: Math.round(light * 100),
        sound: Math.round(sound * 100),
      },
      tips,
    };
  }
}

export function getQualityScorer(): QualityScorer {
  return new MockQualityScorer();
}

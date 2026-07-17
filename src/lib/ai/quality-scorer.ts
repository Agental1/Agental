/**
 * Self-tape quality scoring. Swappable like the match Scorer: the mock derives
 * a score from client-captured framing/light/sound metrics; a real CV/ML
 * scorer can replace it behind the same interface without touching callers.
 */
export interface QualityMetrics {
  framing: number; // 0..1 (subject centered / rule-of-thirds)
  light: number; // 0..1 (exposure adequacy)
  sound: number; // 0..1 (level / clipping)
  durationMs: number;
}

export interface QualityResult {
  score: number; // 0..100
  breakdown: { framing: number; light: number; sound: number };
  tips: string[];
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

    const tips: string[] = [];
    if (framing < 0.6) tips.push("Centre-toi et laisse un peu d'air au-dessus de la tête.");
    if (light < 0.6) tips.push("Place-toi face à une source de lumière douce.");
    if (sound < 0.6) tips.push("Rapproche-toi du micro et coupe les bruits de fond.");
    if (m.durationMs < 3000) tips.push("Ta prise est très courte — joue la scène en entier.");
    if (tips.length === 0) tips.push("Excellente prise — cadrage, lumière et son au rendez-vous.");

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

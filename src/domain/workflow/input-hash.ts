import type { NormalizedBrief } from "./brief";
import { briefClosed } from "./constraints";
import { recordFields } from "./fit";
import { sha256Hex, stableStringify } from "./normalize";
import type { ProfileFacts } from "./profile";

/**
 * The fingerprint of one assessment's inputs: every brief and profile field
 * a rule or the model may read, the rule version and the model version (null
 * when the rules decided alone). Equal inputs give an equal hash, which is
 * how FitEvaluation's unique key keeps the same question from being assessed
 * twice.
 *
 * The clock enters in two places only, and both as facts. Whether the brief
 * is closed at `now` is hashed as a yes or a no. Which availability windows
 * are still ahead is already decided when the profile facts are built. So an
 * assessment made while a brief was open is never reused once it has closed.
 */
export function inputHashFor(
  brief: NormalizedBrief,
  profile: ProfileFacts,
  ruleVersion: string,
  modelVersion: string | null,
  now: Date
): string {
  const fields = Object.fromEntries(recordFields(brief, profile));
  return sha256Hex(
    stableStringify({ fields, closed: briefClosed(brief, now), ruleVersion, modelVersion })
  );
}

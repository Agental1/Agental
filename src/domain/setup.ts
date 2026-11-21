import { isAdult } from "./age";

/**
 * What a performer has to save before the dashboard treats the account as set
 * up. Two steps, the same two the sign-up wizard asks for:
 *
 *   identity  a stage name and an adult date of birth
 *   profile   at least one specialty
 *
 * There is no third step. The representation agreement used to be one; it is
 * out of the beta until counsel approves a version (see ./mandat.ts), and
 * nothing here reads it.
 *
 * Pure, so the dashboard card, the wizard's resume point and the post sign-in
 * routing all answer from one rule.
 */
export const SETUP_STEPS = ["identity", "profile"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export interface SetupProfile {
  stageName: string;
  birthDate: Date | null;
  specialtiesCount: number;
}

/**
 * The first unfinished step, or null when the basics are saved. A missing
 * profile row means nothing was saved yet. A stored date of birth under 18
 * keeps the identity step open: the beta is for adults, and saveIdentity
 * refuses such a date in the first place.
 */
export function nextSetupStep(
  profile: SetupProfile | null | undefined,
  today: Date = new Date()
): SetupStep | null {
  if (!profile) return "identity";
  if (profile.stageName.trim().length < 2) return "identity";
  if (!profile.birthDate || !isAdult(profile.birthDate, today)) return "identity";
  if (profile.specialtiesCount < 1) return "profile";
  return null;
}

export function isSetupComplete(
  profile: SetupProfile | null | undefined,
  today: Date = new Date()
): boolean {
  return nextSetupStep(profile, today) === null;
}

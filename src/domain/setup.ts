import { isAdult } from "./age";
import { legalNameParts } from "./completeness";

/**
 * What a performer has to save before the dashboard treats the account as set
 * up. Round 10 (founder): the sign-up questions are the profile's own fields,
 * saved straight into the profile, so they count toward 100%:
 *
 *   identity  legal first and last name (stage name optional)
 *   profile   an adult date of birth and a gender (phone optional here)
 *
 * The third screen of the wizard only explains the representation agreement
 * (out of the beta, see ./mandat.ts); nothing here reads it. The city is not
 * asked at sign-up: it comes later in the profile.
 *
 * Pure, so the dashboard card, the wizard's resume point and the post sign-in
 * routing all answer from one rule.
 */
export const SETUP_STEPS = ["identity", "profile"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export interface SetupProfile {
  legalFirstName: string | null;
  legalLastName: string | null;
  /** The older single legal-name field (split at the first space). */
  legalName?: string | null;
  birthDate: Date | null;
  gender: string | null;
}

/**
 * The first unfinished step, or null when the basics are saved. A missing
 * profile row means nothing was saved yet. A stored date of birth under 18
 * keeps the second step open: the beta is for adults.
 */
export function nextSetupStep(
  profile: SetupProfile | null | undefined,
  today: Date = new Date()
): SetupStep | null {
  if (!profile) return "identity";
  const { first, last } = legalNameParts(profile);
  if (!first || !last) return "identity";
  if (!profile.birthDate || !isAdult(profile.birthDate, today)) return "profile";
  if (!profile.gender || !profile.gender.trim()) return "profile";
  return null;
}

export function isSetupComplete(
  profile: SetupProfile | null | undefined,
  today: Date = new Date()
): boolean {
  return nextSetupStep(profile, today) === null;
}

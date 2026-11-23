/**
 * Round 10, group 4: the cookie choice as the admin shows it. Two optional
 * categories (analytics, marketing): both on is "Accepted all", both off
 * "Rejected non-essential", one of each "Custom". Nothing recorded: "none".
 */
export const CONSENT_CHOICES = ["accepted_all", "rejected", "custom", "none"] as const;
export type ConsentChoice = (typeof CONSENT_CHOICES)[number];

export function consentChoiceOf(c: { consentAnalytics: boolean | null; consentMarketing: boolean | null }): ConsentChoice {
  if (c.consentAnalytics === null || c.consentMarketing === null) return "none";
  if (c.consentAnalytics && c.consentMarketing) return "accepted_all";
  if (!c.consentAnalytics && !c.consentMarketing) return "rejected";
  return "custom";
}

/** Monday 00:00 UTC of the week holding `d` (the visitors' tally is weekly). */
export function weekStartOf(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

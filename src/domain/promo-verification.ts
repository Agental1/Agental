/**
 * USC student verification by a 6-digit code (round 8b): who may receive one,
 * how long it lasts, how many tries it allows, how soon it may be resent.
 */
export const USC_PROMOTION_ID = "usc-student";
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_MS = 60 * 1000;

/** Only an address that ends in @usc.edu (not a subdomain, not a look-alike). */
export function isUscEmail(email: string): boolean {
  return /^[^\s@]+@usc\.edu$/i.test(email.trim());
}

export function isSixDigits(code: string): boolean {
  return /^\d{6}$/.test(code);
}

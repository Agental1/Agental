import { z } from "zod";

/**
 * College student discount on Pro, proven by a school email address.
 *
 * Founders' settings live here. Until they are set the discount is recorded
 * (User.studentVerifiedAt, User.studentEmail) but no amount is shown or
 * charged: billing reads `discountPercent` and `stripeCouponId` when real
 * payments open.
 */
export const STUDENT_DISCOUNT = {
  /** Address endings that count as a school address. Lowercase, with the dot. */
  allowedDomainSuffixes: [".edu"] as readonly string[],
  /** TODO(founders): the Pro discount, in percent. Null: not decided yet. */
  discountPercent: null as number | null,
  /** TODO(founders): the Stripe coupon (or promotion code) to apply at checkout. */
  stripeCouponId: null as string | null,
  /** How long the link in the email works. */
  linkTtlMs: 48 * 60 * 60 * 1000,
  /** Verification emails per account per hour. */
  sendsPerHour: 3,
} as const;

export const SchoolEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "errors.studentEmailInvalid" }));

/** True when the address ends with an allowed school domain (any subdomain). */
export function isSchoolEmail(
  email: string,
  suffixes: readonly string[] = STUDENT_DISCOUNT.allowedDomainSuffixes
): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) return false;
  return suffixes.some((s) => domain.endsWith(s) && domain.length > s.length);
}

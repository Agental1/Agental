import { z } from "zod";

/**
 * Rules for share links: a deliberate, time-limited link to one clip that a
 * talent hands to someone outside the product.
 *
 * Pure and safe to import from a client component (for the expiry choices
 * and the limit shown in the interface). Tokens and hashing live in
 * src/lib/share.ts, which is server-only.
 */

/** How long a link works when the talent does not choose. */
export const SHARE_DEFAULT_HOURS = 72;
export const SHARE_MIN_HOURS = 1;
/** Seven days. */
export const SHARE_MAX_HOURS = 7 * 24;

/** Links that work at the same time (not revoked, not expired), per clip. */
export const SHARE_MAX_ACTIVE = 5;

/** How many links, newest first, a listing returns for one clip. */
export const SHARE_LIST_LIMIT = 50;

const HOUR_MS = 60 * 60 * 1000;

export const CreateShareLinkInput = z.object({
  // Any finite number: values outside the range are clamped, never refused.
  expiresInHours: z.number().nullish(),
});
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkInput>;

/**
 * The lifetime a link really gets: the default when none is asked for, and
 * otherwise the request held between one hour and seven days.
 */
export function clampShareHours(hours?: number | null): number {
  if (hours === undefined || hours === null || !Number.isFinite(hours)) {
    return SHARE_DEFAULT_HOURS;
  }
  return Math.min(SHARE_MAX_HOURS, Math.max(SHARE_MIN_HOURS, hours));
}

/** When a link created now stops working. */
export function shareExpiry(now: Date, hours?: number | null): Date {
  return new Date(now.getTime() + clampShareHours(hours) * HOUR_MS);
}

/** A link works until it is revoked or its time is up, whichever comes first. */
export function shareIsActive(
  share: { expiresAt: Date; revokedAt: Date | null },
  now: Date
): boolean {
  return share.revokedAt === null && share.expiresAt.getTime() > now.getTime();
}

import type { OAuthProviderId } from "./oauth-providers";

/**
 * A provider identity we are willing to act on: a stable subject and an email
 * address the provider says it verified.
 */
export interface OAuthIdentity {
  provider: OAuthProviderId;
  /** The provider's `sub`, stored as Account.providerAccountId. */
  providerAccountId: string;
  /** Trimmed and lowercased. */
  email: string;
  name: string | null;
  image: string | null;
}

export const NAME_MAX_LENGTH = 100;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Trim, cap and drop empties. Provider names are display text, nothing more. */
export function cleanName(...parts: unknown[]): string | null {
  const joined = parts
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return joined ? joined.slice(0, NAME_MAX_LENGTH).trim() : null;
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

type Profile = Record<string, unknown> | null | undefined;

/**
 * Build the identity from the ID token claims, or null when the provider does
 * not vouch for the email.
 *
 * - Google sends `email_verified` as a boolean. Anything but `true` is refused.
 * - Apple has sent it as a boolean and as the string "true" over the years.
 *   Its `user` field (name on first consent only) arrives as an unsigned form
 *   field, so it is length-limited and treated as display text.
 */
export function identityFromProfile(
  provider: OAuthProviderId,
  providerAccountId: string | undefined,
  profile: Profile
): OAuthIdentity | null {
  if (!profile) return null;
  const sub =
    typeof profile.sub === "string" && profile.sub
      ? profile.sub
      : providerAccountId;
  if (!sub) return null;
  const email =
    typeof profile.email === "string" ? normalizeEmail(profile.email) : "";
  if (!email || !email.includes("@")) return null;

  if (provider === "google") {
    if (profile.email_verified !== true) return null;
    return {
      provider,
      providerAccountId: sub,
      email,
      name: cleanName(profile.name),
      image: cleanUrl(profile.picture),
    };
  }

  const verified =
    profile.email_verified === true || profile.email_verified === "true";
  if (!verified) return null;
  const user = profile.user as
    | { name?: { firstName?: unknown; lastName?: unknown } }
    | undefined;
  return {
    provider,
    providerAccountId: sub,
    email,
    name: cleanName(user?.name?.firstName, user?.name?.lastName),
    image: null,
  };
}

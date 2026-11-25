import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hitRateLimit, peekRateLimit, recordRateLimit } from "@/lib/rate-limit";
import { abuseKeyHash } from "@/lib/rate-key";

/**
 * Abuse protection for sign-up, sign-in and password reset: rate limits per
 * address and per email (stored as keyed hashes, never in clear), and an
 * optional Cloudflare Turnstile check, on when TURNSTILE_SECRET_KEY is set.
 */

const SIGNIN_LIMITS = { ip: { limit: 30, windowMs: 15 * 60 * 1000 }, email: { limit: 10, windowMs: 15 * 60 * 1000 } } as const;

export const AUTH_LIMITS = {
  signin: SIGNIN_LIMITS,
  // Round 8d: the same limits inside the credentials check itself, so a POST
  // straight to /api/auth/callback/credentials (skipping the sign-in form's
  // action) is limited too.
  signinCallback: SIGNIN_LIMITS,
} as const;

const keyHash = abuseKeyHash;

/**
 * Round 11 (r111): sign-up limits. Until r111 it was 5 attempts per hour per
 * address and 3 per hour per email, every attempt counted: a founder testing
 * from one network hit "Too many attempts" on the sixth sign-up of the hour,
 * even for a brand new address. Now:
 *   - attempts per address: 30 per 15 minutes (like sign-in), against floods;
 *   - accounts created per address: 20 per hour, counted only on success;
 *   - per email, only refusals for an address already taken are counted (5 per
 *     hour), so a first attempt for an address is never refused by its email.
 * Deleting an account clears the email-keyed counters (account-removal.ts).
 */
export const SIGNUP_LIMITS = {
  ipAttempts: { limit: 30, windowMs: 15 * 60 * 1000 },
  ipCreated: { limit: 20, windowMs: 60 * 60 * 1000 },
  emailTaken: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

export type SignupGate = { ok: true; ipKey: string; emailKey: string } | { ok: false; retryAfterMs: number };

/** Before a sign-up: refused when the network or the address is over its limit. */
export async function signupAllowed(email: string): Promise<SignupGate> {
  const ipKey = keyHash(await clientAddress());
  const emailKey = keyHash(email.trim().toLowerCase());
  const created = await peekRateLimit(prisma, `signup-created:ip:${ipKey}`, SIGNUP_LIMITS.ipCreated);
  if (!created.allowed) return { ok: false, retryAfterMs: created.retryAfterMs };
  const attempts = await hitRateLimit(prisma, `signup:ip:${ipKey}`, SIGNUP_LIMITS.ipAttempts);
  if (!attempts.allowed) return { ok: false, retryAfterMs: attempts.retryAfterMs };
  const taken = await peekRateLimit(prisma, `signup-taken:email:${emailKey}`, SIGNUP_LIMITS.emailTaken);
  if (!taken.allowed) return { ok: false, retryAfterMs: taken.retryAfterMs };
  return { ok: true, ipKey, emailKey };
}

/** After the gate: count the outcome that the limits above are about. */
export async function recordSignupOutcome(gate: { ipKey: string; emailKey: string }, outcome: "created" | "taken"): Promise<void> {
  await recordRateLimit(
    prisma,
    outcome === "created" ? `signup-created:ip:${gate.ipKey}` : `signup-taken:email:${gate.emailKey}`
  );
}

/** Minutes to show in "try again in N minutes", at least 1. */
export const retryMinutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** False once either the address or the email is over its limit. */
export async function authAllowed(kind: keyof typeof AUTH_LIMITS, email: string): Promise<boolean> {
  const limits = AUTH_LIMITS[kind];
  const ip = await clientAddress();
  const byIp = await hitRateLimit(prisma, `${kind}:ip:${keyHash(ip)}`, limits.ip);
  if (!byIp.allowed) return false;
  const byEmail = await hitRateLimit(prisma, `${kind}:email:${keyHash(email.trim().toLowerCase())}`, limits.email);
  return byEmail.allowed;
}

export function captchaEnabled(env = process.env): boolean {
  return !!(env.TURNSTILE_SECRET_KEY ?? "").trim() && !!(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
}

/** True when the CAPTCHA is off, or Cloudflare confirms the token. */
export async function captchaPassed(token: unknown): Promise<boolean> {
  if (!captchaEnabled()) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!.trim(),
      response: token,
      remoteip: await clientAddress(),
    });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

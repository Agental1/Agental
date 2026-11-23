import { createHmac, hkdfSync } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * Abuse protection for sign-up, sign-in and password reset: rate limits per
 * address and per email (stored as keyed hashes, never in clear), and an
 * optional Cloudflare Turnstile check, on when TURNSTILE_SECRET_KEY is set.
 */

const SIGNIN_LIMITS = { ip: { limit: 30, windowMs: 15 * 60 * 1000 }, email: { limit: 10, windowMs: 15 * 60 * 1000 } } as const;

export const AUTH_LIMITS = {
  signup: { ip: { limit: 5, windowMs: 60 * 60 * 1000 }, email: { limit: 3, windowMs: 60 * 60 * 1000 } },
  signin: SIGNIN_LIMITS,
  // Round 8d: the same limits inside the credentials check itself, so a POST
  // straight to /api/auth/callback/credentials (skipping the sign-in form's
  // action) is limited too.
  signinCallback: SIGNIN_LIMITS,
} as const;

function keyHash(value: string): string {
  const key = hkdfSync("sha256", process.env.AUTH_SECRET ?? "", "agental:abuse", "rate-limit-key", 32);
  return createHmac("sha256", new Uint8Array(key)).update(value).digest("hex");
}

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

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { isAdminAccount } from "@/domain/admin";

/**
 * Round 8d: the admin role requires a second factor (TOTP, an authenticator
 * app). An admin signs in as usual, then types a 6-digit code once per
 * ADMIN_MFA_HOURS on /securite-admin; until then every admin page, action and
 * API answers as for a non-admin.
 *
 * The proof is an HttpOnly cookie holding the admin's id, an expiry and an
 * HMAC (key derived from AUTH_SECRET): it cannot be made in a browser, and it
 * stops counting as soon as the admin's enrollment is removed.
 *
 * Required in production builds (Vercel production and preview). ADMIN_MFA_REQUIRED=false in Vercel turns it off
 * (a lost phone, until the founders re-enroll); =true turns it on elsewhere.
 */

export const ADMIN_MFA_COOKIE = "agental_admin_mfa";
export const ADMIN_MFA_HOURS = 12;

type Env = Record<string, string | undefined>;

export function adminMfaRequired(env: Env = process.env): boolean {
  const flag = (env.ADMIN_MFA_REQUIRED ?? "").trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") {
    if (env.NODE_ENV === "production") console.warn("[admin-mfa] ADMIN_MFA_REQUIRED=false: the admin second factor is OFF");
    return false;
  }
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

function key(purpose: string): Buffer {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) throw new Error("AUTH_SECRET missing");
  return Buffer.from(hkdfSync("sha256", secret, "agental:admin-mfa", purpose, 32));
}

/** AES-256-GCM, "iv.tag.data" in base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("totp-secret"), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(enc: string): string {
  const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key("totp-secret"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", key("session-proof")).update(payload).digest("base64url");
}

/**
 * The cookie value proving a code was typed: "<userId>.<expiry ms>.<hmac>".
 * The HMAC also covers the enrollment's id, so a new enrollment voids every
 * earlier proof.
 */
export function mfaProof(userId: string, enrollmentId: string, now = new Date()): { value: string; expires: Date } {
  const expires = new Date(now.getTime() + ADMIN_MFA_HOURS * 60 * 60 * 1000);
  const mac = sign(`${userId}.${enrollmentId}.${expires.getTime()}`);
  return { value: `${userId}.${expires.getTime()}.${mac}`, expires };
}

export function proofValid(
  value: string | undefined,
  userId: string,
  enrollmentId: string,
  now = new Date()
): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, exp, mac] = parts;
  if (id !== userId || !/^\d+$/.test(exp) || Number(exp) <= now.getTime()) return false;
  const expected = Buffer.from(sign(`${id}.${enrollmentId}.${exp}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Set the proof cookie (server actions only). */
export async function setMfaCookie(userId: string, enrollmentId: string): Promise<void> {
  const { value, expires } = mfaProof(userId, enrollmentId);
  (await cookies()).set(ADMIN_MFA_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** The admin typed a valid code this session (or the second factor is off). */
export async function adminMfaSatisfied(userId: string): Promise<boolean> {
  if (!adminMfaRequired()) return true;
  const value = (await cookies()).get(ADMIN_MFA_COOKIE)?.value;
  if (!value) return false;
  const enrolled = await prisma.adminTotp.findUnique({ where: { userId }, select: { id: true, verifiedAt: true } });
  return !!enrolled?.verifiedAt && proofValid(value, userId, enrolled.id);
}

/** Sign-out: the second factor goes with the session. */
export async function clearMfaCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_MFA_COOKIE);
}

/**
 * The one admin test for pages, actions and APIs: the admin rule
 * (src/domain/admin.ts) AND the second factor.
 */
export async function isVerifiedAdmin(
  user: { id: string; isAdmin?: boolean | null; email?: string | null } | null | undefined
): Promise<boolean> {
  if (!user || !isAdminAccount(user)) return false;
  return adminMfaSatisfied(user.id);
}

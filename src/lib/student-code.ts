import { createHmac, hkdfSync, randomInt } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ErrorKey } from "@/domain/action-result";
import { audit } from "@/lib/audit";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * College student codes.
 *
 * A student gets the discount by typing a 6-digit code. Everything about the
 * code is decided on the server: the format, the lookup, the expiry, the
 * usage cap and the number of guesses allowed per hour. Redeeming a code only
 * stamps User.studentVerifiedAt. Billing reads that stamp later.
 *
 * Codes are never stored. The table keeps an HMAC of each one, keyed from
 * AUTH_SECRET. Six digits make one million values, so a plain hash could be
 * reversed from a database dump in under a second. With the pepper, the dump
 * alone is not enough. The other side of that choice: rotating AUTH_SECRET
 * orphans every code issued before the rotation.
 *
 * The database client is a parameter so the rules are tested against a mock.
 */

/** Guesses allowed per user in one window, valid or not. */
export const STUDENT_CODE_ATTEMPTS = 5;
export const STUDENT_CODE_WINDOW_MS = 60 * 60 * 1000;

const CODE_LENGTH = 6;
// Longer than any way of typing six digits with separators. Anything beyond
// it is refused before a regex runs over it.
const MAX_RAW_LENGTH = 32;

const HKDF_SALT = "agental.student-code.v1";
const HKDF_INFO = "agental:student-code";

/** How many fresh codes createCode tries before giving up on collisions. */
const CREATE_ATTEMPTS = 5;

function requireSecret(secret: string): string {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("AUTH_SECRET is not set; cannot hash a student code.");
  }
  return secret;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Bring what a person typed to the stored form: spaces and hyphens removed,
 * then exactly six ASCII digits. Anything else, including a non-string sent
 * straight to the server action, is null.
 */
export function normalizeStudentCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > MAX_RAW_LENGTH) return null;
  const compact = raw.replace(/[\s-]/g, "");
  return /^[0-9]{6}$/.test(compact) ? compact : null;
}

/**
 * HMAC-SHA256 of a normalized code, in hex. The key is derived from the
 * secret with HKDF and a label of its own, so the session secret is never
 * used as an HMAC key directly and this hash matches no other use of it.
 */
export function hashStudentCode(code: string, secret: string): string {
  const key = hkdfSync("sha256", requireSecret(secret), HKDF_SALT, HKDF_INFO, 32);
  return createHmac("sha256", new Uint8Array(key)).update(code).digest("hex");
}

/** Six digits from the system CSPRNG, leading zeros kept. */
export function generateStudentCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

export type RedeemCodeError = Extract<
  ErrorKey,
  | "errors.studentCodeInvalid"
  | "errors.studentCodeExpired"
  | "errors.studentCodeUsedUp"
  | "errors.tooManyAttempts"
>;

export type RedeemCodeResult =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; error: RedeemCodeError };

export interface RedeemCodeInput {
  userId: string;
  /** Whatever the client sent. Normalized here, never trusted. */
  code: unknown;
  /** The pepper: AUTH_SECRET. */
  secret: string;
  /** Defaults to the current time. Tests pin it. */
  now?: Date;
}

type RedeemDb = Pick<
  PrismaClient,
  "user" | "studentCode" | "rateLimitEvent" | "$transaction"
>;

/** Thrown inside the transaction so the redemption rolls back with it. */
class CodeUsedUp extends Error {}

/**
 * Redeem a code for a user.
 *
 * 1. Already verified: answer ok and count nothing.
 * 2. Count the attempt. Every attempt counts, valid or not, so guessing is
 *    bounded at STUDENT_CODE_ATTEMPTS per window whatever comes next.
 * 3. Wrong format or unknown code: invalid. The two are told apart nowhere,
 *    so the answer says nothing about which codes exist.
 * 4. Expired: expired.
 * 5. One transaction: the redemption row, one use claimed on the code, the
 *    stamp on the user and the audit entry. All four or none.
 *
 * Inside the transaction the redemption row goes first. Its unique
 * (codeId, userId) pair makes a double submit wait for the first request and
 * then fail with P2002, before it can claim a second use, and that is
 * answered as already verified. The use is then claimed with one conditional
 * UPDATE: `uses < maxUses`, with the cap read a moment earlier as a constant.
 * Postgres checks that condition again on the row as it is when the lock is
 * granted, so two students racing for the last use cannot both get it, and a
 * code with uses to spare never refuses anyone because of the race. When the
 * UPDATE matches no row the cap is reached, and throwing rolls the redemption
 * row back.
 */
export async function redeemCode(
  db: RedeemDb,
  input: RedeemCodeInput
): Promise<RedeemCodeResult> {
  // A configuration error, raised before an attempt is counted against
  // someone who did nothing wrong.
  const secret = requireSecret(input.secret);
  const { userId } = input;
  const now = input.now ?? new Date();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { studentVerifiedAt: true },
  });
  // A session can outlive its account. There is nobody to verify, and the
  // caller learns no more than from a wrong code.
  if (!user) return { ok: false, error: "errors.studentCodeInvalid" };
  if (user.studentVerifiedAt) return { ok: true, alreadyVerified: true };

  const limit = await hitRateLimit(db, `student-code:${userId}`, {
    limit: STUDENT_CODE_ATTEMPTS,
    windowMs: STUDENT_CODE_WINDOW_MS,
    now,
  });
  if (!limit.allowed) return { ok: false, error: "errors.tooManyAttempts" };

  const normalized = normalizeStudentCode(input.code);
  if (!normalized) return { ok: false, error: "errors.studentCodeInvalid" };

  const code = await db.studentCode.findUnique({
    where: { codeHash: hashStudentCode(normalized, secret) },
    select: { id: true, label: true, expiresAt: true, maxUses: true },
  });
  if (!code) return { ok: false, error: "errors.studentCodeInvalid" };

  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "errors.studentCodeExpired" };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.studentCodeRedemption.create({
        data: { codeId: code.id, userId },
      });
      const claimed = await tx.studentCode.updateMany({
        where:
          code.maxUses === null
            ? { id: code.id }
            : { id: code.id, uses: { lt: code.maxUses } },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count === 0) throw new CodeUsedUp();
      await tx.user.update({
        where: { id: userId },
        data: { studentVerifiedAt: now },
      });
      // The id and the label only. The code itself is written nowhere.
      await audit(
        {
          actorUserId: userId,
          action: "student.code.redeemed",
          resourceType: "StudentCode",
          resourceId: code.id,
          after: { label: code.label },
        },
        tx
      );
    });
  } catch (error) {
    if (error instanceof CodeUsedUp) {
      return { ok: false, error: "errors.studentCodeUsedUp" };
    }
    // The only unique constraint this transaction can hit is the redemption
    // pair: this user already redeemed this code, a moment ago in a double
    // submit. The failed statement aborted the transaction, so nothing of
    // this second attempt was kept.
    if (isUniqueViolation(error)) return { ok: true, alreadyVerified: true };
    throw error;
  }

  return { ok: true, alreadyVerified: false };
}

export interface CreateCodeInput {
  /** The pepper: AUTH_SECRET. */
  secret: string;
  label?: string;
  expiresAt?: Date | null;
  /** Null or absent: no cap. */
  maxUses?: number | null;
}

type CodeDb = Pick<PrismaClient, "studentCode">;

/**
 * Create a code and return it in the clear, once. Only its hash is stored, so
 * this return value is the single chance to show it to the admin.
 *
 * With a million possible values a new code can land on one that exists. The
 * unique index on codeHash refuses it (P2002) and another one is drawn, a few
 * times. Do not call this inside a transaction: in Postgres the refused
 * insert would abort it and every retry would fail.
 */
export async function createCode(
  db: CodeDb,
  input: CreateCodeInput
): Promise<{ id: string; code: string }> {
  const secret = requireSecret(input.secret);
  const label = input.label?.trim() || null;

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateStudentCode();
    try {
      const row = await db.studentCode.create({
        data: {
          codeHash: hashStudentCode(code, secret),
          label,
          expiresAt: input.expiresAt ?? null,
          maxUses: input.maxUses ?? null,
        },
        select: { id: true },
      });
      return { id: row.id, code };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(
    `Could not draw an unused student code in ${CREATE_ATTEMPTS} attempts.`
  );
}

export interface StudentCodeSummary {
  id: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  createdAt: Date;
}

/** Every code, newest first. Never a code or its hash. */
export async function listCodes(db: CodeDb): Promise<StudentCodeSummary[]> {
  return db.studentCode.findMany({
    select: {
      id: true,
      label: true,
      expiresAt: true,
      maxUses: true,
      uses: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

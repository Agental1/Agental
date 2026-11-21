"use server";

import { isAdminAccount } from "@/domain/admin";
import { z } from "zod";
import { err, zodError, type ActionError } from "@/domain/action-result";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createCode, redeemCode } from "@/lib/student-code";

export type RedeemStudentCodeResult =
  | { ok: true }
  | { ok: false; error: ActionError };

export type CreateStudentCodeResult =
  | { ok: true; id: string; code: string }
  | { ok: false; error: ActionError };

/**
 * Redeem a college student code for the signed-in user. Stripe is not wired
 * yet: this only marks the user as a verified student, and billing applies
 * the discount later. The rules live in src/lib/student-code.ts.
 */
export async function redeemStudentCode(
  code: string
): Promise<RedeemStudentCodeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: err("errors.unauthorized") };
  }

  const result = await redeemCode(prisma, {
    userId: session.user.id,
    code,
    // An empty secret makes redeemCode throw before anything is counted.
    secret: process.env.AUTH_SECRET ?? "",
  });
  if (!result.ok) return { ok: false, error: err(result.error) };

  revalidatePath("/[locale]/talents/(space)/app/abonnement", "page");
  revalidatePath("/[locale]/casting/(space)/app/abonnement", "page");
  return { ok: true };
}

const CreateStudentCodeInput = z.object({
  label: z.string().trim().max(80).optional(),
  // A full ISO 8601 instant, or a calendar day (see parseExpiry).
  expiresAt: z
    .union([z.iso.datetime({ offset: true }), z.iso.date()])
    .optional(),
  maxUses: z.number().int().min(1).max(100000).optional(),
});

/**
 * A full instant is taken as is. A calendar day ("2027-06-30") means the code
 * works through the end of that day, UTC: an admin who picks June 30 does not
 * expect the code to stop at the first second of it.
 */
function parseExpiry(value: string): Date | null {
  const date = new Date(value.includes("T") ? value : `${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Admins only: create a code. The plain code is in the return value and
 * nowhere else. Show it once, it cannot be read back.
 */
export async function createStudentCode(input: {
  label?: string;
  expiresAt?: string;
  maxUses?: number;
}): Promise<CreateStudentCodeResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: err("errors.unauthorized") };
  }
  // The session carries no admin flag. The row decides, on every call.
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, email: true },
  });
  if (!isAdminAccount(me)) return { ok: false, error: err("errors.forbidden") };

  const parsed = CreateStudentCodeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt !== undefined) {
    expiresAt = parseExpiry(parsed.data.expiresAt);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return { ok: false, error: err("errors.invalidInput") };
    }
  }
  // Trimmed by the schema. An empty label is no label.
  const label = parsed.data.label || undefined;

  const created = await createCode(prisma, {
    secret: process.env.AUTH_SECRET ?? "",
    label,
    expiresAt,
    maxUses: parsed.data.maxUses ?? null,
  });
  // The id and the label only, never the code.
  await audit({
    actorUserId: session.user.id,
    action: "student.code.created",
    resourceType: "StudentCode",
    resourceId: created.id,
    after: { label: label ?? null },
  });
  return { ok: true, id: created.id, code: created.code };
}

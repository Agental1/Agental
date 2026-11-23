"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { currentAdminId } from "@/lib/limelight/admin";
import { err, type ActionError } from "@/domain/action-result";
import { AI_PROVIDERS, DEFAULT_THRESHOLD_CENTS, centsFromInput, type AiProvider } from "@/domain/ai-spend";

export type AiAccountResult = { ok: true } | { ok: false; error: ActionError };

/**
 * Round 8d: the founders type what Agental cannot read: the balance after a
 * top-up, the alert threshold (default $20) and a monthly budget. Admins only
 * (with the second factor), audited. A new balance starts a new count of what
 * is left, and its low-balance alert can fire again. Nothing here touches a
 * provider: this records numbers, it moves no money.
 */
export async function saveAiAccount(input: {
  provider: unknown;
  balance: unknown;
  threshold: unknown;
  budget: unknown;
}): Promise<AiAccountResult> {
  const adminId = await currentAdminId();
  if (!adminId) return { ok: false, error: err("errors.forbidden") };
  const provider = AI_PROVIDERS.find((p) => p === input.provider) as AiProvider | undefined;
  if (!provider) return { ok: false, error: err("errors.invalidInput") };
  const balance = centsFromInput(input.balance);
  const threshold = centsFromInput(input.threshold);
  const budget = centsFromInput(input.budget);
  if (balance === undefined || threshold === undefined || budget === undefined) {
    return { ok: false, error: err("errors.invalidInput") };
  }

  const before = await prisma.aiProviderAccount.findUnique({ where: { provider } });
  const balanceChanged = balance !== (before?.balanceCents ?? null);
  const data = {
    balanceCents: balance,
    balanceSetAt: balanceChanged ? (balance === null ? null : new Date()) : (before?.balanceSetAt ?? null),
    thresholdCents: threshold ?? DEFAULT_THRESHOLD_CENTS,
    monthlyBudgetCents: budget,
  };
  await prisma.aiProviderAccount.upsert({ where: { provider }, create: { provider, ...data }, update: data });
  await audit({
    actorUserId: adminId,
    action: "admin.ai_account.save",
    resourceType: "AiProviderAccount",
    resourceId: provider,
    before: before
      ? { balanceCents: before.balanceCents, thresholdCents: before.thresholdCents, monthlyBudgetCents: before.monthlyBudgetCents }
      : null,
    after: { balanceCents: data.balanceCents, thresholdCents: data.thresholdCents, monthlyBudgetCents: data.monthlyBudgetCents },
  });
  revalidatePath("/[locale]/admin", "page");
  return { ok: true };
}

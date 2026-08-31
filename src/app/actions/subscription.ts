"use server";

import { err, type ActionError } from "@/domain/action-result";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getBilling } from "@/lib/billing";
import { PlanB2C, PlanB2B } from "@/domain/enums";

export type UpgradeResult = { ok: boolean; error?: ActionError; checkoutUrl?: string };

/** B2C: change the artist's subscription plan (mock = instant, no payment). */
export async function upgradeTalentPlan(plan: string): Promise<UpgradeResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const parsed = PlanB2C.safeParse(plan);
  if (!parsed.success) return { ok: false, error: err("errors.invalidPlan") };

  const billing = await getBilling();
  const { checkoutUrl } = await billing.changePlan({
    subjectType: "ARTIST",
    subjectId: session.user.id,
    plan: parsed.data,
  });
  await audit({
    actorUserId: session.user.id,
    action: "subscription.change",
    resourceType: "Subscription",
    resourceId: session.user.id,
    after: { plan: parsed.data },
  });
  revalidatePath("/[locale]/talents/(space)/app/abonnement", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true, checkoutUrl };
}

/** B2B: change the org plan; Pro is per active seat. */
export async function changeOrgPlan(plan: string): Promise<UpgradeResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "CASTING") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const parsed = PlanB2B.safeParse(plan);
  if (!parsed.success) return { ok: false, error: err("errors.invalidPlan") };

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
  });
  if (!membership) return { ok: false, error: err("errors.orgNotFound") };

  const seatCount = await prisma.seat.count({
    where: { organizationId: membership.organizationId, status: "ACTIVE" },
  });

  const billing = await getBilling();
  const { checkoutUrl } = await billing.changePlan({
    subjectType: "ORG",
    subjectId: membership.organizationId,
    plan: parsed.data,
    seatCount: Math.max(1, seatCount),
  });
  await audit({
    actorUserId: session.user.id,
    organizationId: membership.organizationId,
    action: "subscription.change",
    resourceType: "Subscription",
    resourceId: membership.organizationId,
    after: { plan: parsed.data, seatCount },
  });
  revalidatePath("/[locale]/casting/(space)/app/abonnement", "page");
  revalidatePath("/[locale]/casting/(space)/app", "page");
  return { ok: true, checkoutUrl };
}

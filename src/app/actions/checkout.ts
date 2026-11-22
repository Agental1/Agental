"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { err, type ActionError } from "@/domain/action-result";
import { B2C_PLANS, findPromotion } from "@/domain/pricing";
import { getLocale } from "next-intl/server";
import { PlanB2C } from "@/domain/enums";
import { USC_PROMOTION_ID } from "@/domain/promo-verification";
import { sendUscCode, verifyUscCode } from "@/lib/promo-verification";
import { hitRateLimit } from "@/lib/rate-limit";

export type CheckoutResult =
  | { ok: true; verifiedAt?: string; email?: string; alreadyVerified?: boolean }
  | { ok: false; error: ActionError; codePending?: boolean };

async function talent() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return { id: session.user.id, locale: await getLocale() };
}

/**
 * A failure inside an action answers a plain message instead of taking the
 * whole Subscription page down (QA, round 8b).
 */
async function safely(run: () => Promise<CheckoutResult>): Promise<CheckoutResult> {
  try {
    return await run();
  } catch (e) {
    console.error("[checkout] action failed:", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: err("errors.codeUnavailable") };
  }
}

/** Round 8b: send the 6-digit code to a @usc.edu address. */
export async function sendUscCodeAction(email: unknown): Promise<CheckoutResult> {
  return safely(() => sendUscCodeInner(email));
}

/** Round 8b: check the code. A match marks the account "USC student verified". */
export async function verifyUscCodeAction(code: unknown): Promise<CheckoutResult> {
  return safely(() => verifyUscCodeInner(code));
}

async function sendUscCodeInner(email: unknown): Promise<CheckoutResult> {
  const me = await talent();
  if (!me) return { ok: false, error: err("errors.unauthorized") };
  const parsed = z.string().max(320).safeParse(email);
  if (!parsed.success) return { ok: false, error: err("errors.uscEmailOnly") };
  // At most 5 code emails a day per account and per address (the 60-second
  // wait alone would allow hundreds).
  const day = 24 * 60 * 60 * 1000;
  const address = parsed.data.trim().toLowerCase();
  for (const key of [`usc-send:${me.id}`, `usc-send-to:${address}`]) {
    if (!(await hitRateLimit(prisma, key, { limit: 5, windowMs: day })).allowed) {
      return { ok: false, error: err("errors.codeDailyLimit") };
    }
  }
  const res = await sendUscCode({ userId: me.id, email: parsed.data, locale: me.locale });
  if (res.ok) return { ok: true };
  switch (res.reason) {
    case "invalid_email":
      return { ok: false, error: err("errors.uscEmailOnly") };
    case "already": {
      // Verified earlier (another tab, another form): nothing to send.
      const u = await prisma.user.findUnique({ where: { id: me.id }, select: { uscVerifiedAt: true, uscVerifiedEmail: true } });
      return { ok: true, alreadyVerified: true, verifiedAt: u?.uscVerifiedAt?.toISOString(), email: u?.uscVerifiedEmail ?? undefined };
    }
    case "taken":
      return { ok: false, error: err("errors.uscEmailTaken") };
    case "too_soon":
      // A code was sent a moment ago: the person can type it.
      return {
        ok: false,
        codePending: true,
        error: err("errors.codeTooSoon", { seconds: Math.ceil((res.retryInMs ?? 60_000) / 1000) }),
      };
    default:
      return { ok: false, error: err("errors.codeUnavailable") };
  }
}

async function verifyUscCodeInner(code: unknown): Promise<CheckoutResult> {
  const me = await talent();
  if (!me) return { ok: false, error: err("errors.unauthorized") };
  const parsed = z.string().max(12).safeParse(code);
  if (!parsed.success) return { ok: false, error: err("errors.codeWrong", { left: 0 }) };
  // A ceiling on tries across codes too (each code already allows 5).
  const limit = await hitRateLimit(prisma, `usc-code:${me.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return { ok: false, error: err("errors.codeLocked") };
  const res = await verifyUscCode({ userId: me.id, code: parsed.data });
  if (res.ok) {
    revalidatePath("/[locale]/talents/(space)/app/abonnement", "page");
    return { ok: true, verifiedAt: res.verifiedAt.toISOString(), email: res.email };
  }
  if (res.reason === "wrong") return { ok: false, error: err("errors.codeWrong", { left: res.attemptsLeft ?? 0 }) };
  if (res.reason === "locked") return { ok: false, error: err("errors.codeLocked") };
  if (res.reason === "expired") return { ok: false, error: err("errors.codeExpired") };
  if (res.reason === "taken") return { ok: false, error: err("errors.uscEmailTaken") };
  return { ok: false, error: err("errors.codeWrong", { left: 0 }) };
}

/**
 * Round 8b: the card step was reached. Card payments are not open, so nothing
 * is charged and the plan does not change; the choice (plan, price,
 * promotion, date) is kept so the team can write when payments open. The
 * price comes from the configuration, and the promotional one only for a
 * verified account.
 */
export async function recordPlanChoice(plan: unknown, promotionId: unknown): Promise<CheckoutResult> {
  const me = await talent();
  if (!me) return { ok: false, error: err("errors.unauthorized") };
  const p = PlanB2C.safeParse(plan);
  if (!p.success || p.data === "FREE") return { ok: false, error: err("errors.invalidPlan") };
  const id = p.data;
  const promo = typeof promotionId === "string" ? findPromotion(promotionId) : null;
  let promoApplied: string | null = null;
  let priceCents = B2C_PLANS[id].priceCents;
  if (promo) {
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { uscVerifiedAt: true } });
    const promoPrice = promo.prices[id];
    if (promo.id === USC_PROMOTION_ID && user?.uscVerifiedAt && promoPrice != null) {
      priceCents = promoPrice;
      promoApplied = promo.id;
    }
  }
  // One record per plan, price and promotion a day: reopening the panel adds nothing.
  const recent = await prisma.planChoice.findFirst({
    where: { userId: me.id, plan: id, priceCents, promotionId: promoApplied, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { id: true },
  });
  if (recent) return { ok: true };
  const row = await prisma.planChoice.create({
    data: { userId: me.id, plan: id, priceCents, promotionId: promoApplied },
    select: { id: true },
  });
  await audit({
    actorUserId: me.id,
    action: "plan.choice",
    resourceType: "PlanChoice",
    resourceId: row.id,
    after: { plan: id, priceCents, promotion: promoApplied },
  });
  return { ok: true };
}

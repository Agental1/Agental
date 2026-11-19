import type { PrismaClient } from "@/generated/prisma/client";
import { PlanB2C } from "@/domain/enums";
import { prisma } from "@/lib/db";

/**
 * Which plan a talent actually has right now.
 *
 * Two things can grant a plan. A paid subscription (`Subscription.plan`), and
 * a complimentary plan (`compPlan` until `compUntil`): every Limelight
 * purchase includes some months of Pro at no charge. The complimentary plan
 * never touches `plan`, `priceCents` or `status`, so it cannot be mistaken
 * for a paid subscription and it ends by itself when the date passes, with no
 * job to run.
 *
 * Read a talent's plan through `effectivePlan` or `getTalentPlan`, never from
 * `Subscription.plan` alone: that column still says FREE during the
 * complimentary months.
 */

/** The subscription fields the rule needs. A Prisma Subscription row fits. */
export interface PlanSource {
  plan: string;
  status: string;
  compPlan: string | null;
  compUntil: Date | null;
}

export interface EffectivePlan {
  plan: PlanB2C;
  /** When the complimentary plan ends. Null unless `source` is "limelight". */
  proUntil: Date | null;
  /** What grants the plan: a paid subscription, a Limelight purchase, or nothing. */
  source: "subscription" | "limelight" | "none";
}

const FREE: EffectivePlan = { plan: "FREE", proUntil: null, source: "none" };

/**
 * The rule, in order:
 * 1. a paid plan (anything but FREE) whose status is ACTIVE wins;
 * 2. otherwise a complimentary plan that has not ended applies;
 * 3. otherwise FREE.
 *
 * A paid plan that is PAST_DUE or CANCELED does not block the complimentary
 * one: the talent keeps what the Limelight purchase included. A value that is
 * not a B2C plan (a typo, a B2B plan name) grants nothing.
 */
export function effectivePlan(sub: PlanSource | null, now: Date): EffectivePlan {
  if (!sub) return FREE;

  const paid = PlanB2C.safeParse(sub.plan);
  if (paid.success && paid.data !== "FREE" && sub.status === "ACTIVE") {
    return { plan: paid.data, proUntil: null, source: "subscription" };
  }

  const comp = PlanB2C.safeParse(sub.compPlan);
  if (
    comp.success &&
    comp.data !== "FREE" &&
    sub.compUntil !== null &&
    sub.compUntil.getTime() > now.getTime()
  ) {
    return { plan: comp.data, proUntil: sub.compUntil, source: "limelight" };
  }

  return FREE;
}

/** Load a talent's subscription and apply `effectivePlan`. */
export async function getTalentPlan(
  userId: string,
  now: Date = new Date(),
  db: Pick<PrismaClient, "subscription"> = prisma
): Promise<EffectivePlan> {
  const sub = await db.subscription.findUnique({
    where: { subjectId: userId },
    select: { plan: true, status: true, compPlan: true, compUntil: true },
  });
  return effectivePlan(sub, now);
}

/**
 * Add calendar months in UTC. The day of the month is kept when the target
 * month has it and clamped to its last day otherwise: January 31 plus one
 * month is February 28 (29 in a leap year), not March 3. The time of day is
 * kept.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const first = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}

/**
 * The new end of a complimentary plan after granting `months` more.
 *
 * Months are added to whichever is later, the current end or now: a talent
 * who buys a second site while the first grant is still running gets the new
 * months on top, and one whose grant already ended starts again from today.
 */
export function extendComp(
  currentUntil: Date | null,
  now: Date,
  months: number
): Date {
  const from =
    currentUntil !== null && currentUntil.getTime() > now.getTime()
      ? currentUntil
      : now;
  return addMonthsUtc(from, months);
}

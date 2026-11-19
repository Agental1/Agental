import type {
  PrismaClient,
  SiteOrder,
  StudentPriceRequest,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { addMonthsUtc, extendComp } from "@/lib/billing/entitlement";
import { LIMELIGHT, type LimelightOffer } from "@/domain/limelight";
import { B2C_PLANS } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";
import { parseSiteContent, type SiteContent } from "@/domain/site";

/**
 * Limelight on the server: reading sites and student price requests, pricing
 * an offer, and fulfilling a paid order.
 *
 * This is a plain module, not a "use server" file: nothing here checks who is
 * calling. The actions in src/app/actions/sites.ts authenticate and then call
 * in; pages call the read functions with the signed-in user's id, and
 * `listStudentPriceRequests` belongs on admin pages only.
 *
 * The database client is a parameter where a test needs to hand in a mock.
 */

// --------------------------------------------------------------------- reads

export interface SiteView {
  id: string;
  template: string;
  status: string;
  subdomain: string | null;
  customDomain: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Null when the stored JSON no longer passes `SiteContent`. */
  content: SiteContent | null;
  /** The latest paid order for this site. Null until one is paid. */
  paidOrder: {
    id: string;
    offer: string;
    paidAt: Date | null;
    hostingRenewsAt: Date | null;
  } | null;
}

type SiteDb = Pick<PrismaClient, "site">;

const sitePaidOrder = {
  orders: {
    where: { status: "PAID" },
    orderBy: { paidAt: "desc" },
    take: 1,
    select: { id: true, offer: true, paidAt: true, hostingRenewsAt: true },
  },
} as const;

function toSiteView(row: {
  id: string;
  template: string;
  status: string;
  subdomain: string | null;
  customDomain: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  content: string;
  orders: NonNullable<SiteView["paidOrder"]>[];
}): SiteView {
  return {
    id: row.id,
    template: row.template,
    status: row.status,
    subdomain: row.subdomain,
    customDomain: row.customDomain,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    content: parseSiteContent(row.content),
    paidOrder: row.orders[0] ?? null,
  };
}

/** The user's sites, oldest first, drafts included. */
export async function listMySites(
  userId: string,
  db: SiteDb = prisma
): Promise<SiteView[]> {
  const rows = await db.site.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: sitePaidOrder,
  });
  return rows.map(toSiteView);
}

/** One site, only if `userId` owns it. Null otherwise, whatever the reason. */
export async function getSiteForOwner(
  userId: string,
  siteId: string,
  db: SiteDb = prisma
): Promise<SiteView | null> {
  const row = await db.site.findFirst({
    where: { id: siteId, userId },
    include: sitePaidOrder,
  });
  return row ? toSiteView(row) : null;
}

export interface StudentPriceRequestView {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  usedAt: Date | null;
}

/** How many decided requests the admin list shows after the pending ones. */
const DECIDED_REQUESTS_SHOWN = 200;

/**
 * Student price requests for the admin list: every pending one first, oldest
 * first (the order they should be answered in), then the latest decided ones.
 * Carries the user's email, so call it from admin pages only.
 */
export async function listStudentPriceRequests(
  db: Pick<PrismaClient, "studentPriceRequest"> = prisma
): Promise<StudentPriceRequestView[]> {
  const include = { user: { select: { email: true, name: true } } } as const;
  const [pending, decided] = await Promise.all([
    db.studentPriceRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include,
    }),
    db.studentPriceRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      take: DECIDED_REQUESTS_SHOWN,
      include,
    }),
  ]);
  return [...pending, ...decided].map((row) => ({
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    status: row.status,
    createdAt: row.createdAt,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    usedAt: row.usedAt,
  }));
}

/** The user's own student price request. Null when they never asked. */
export async function getMyStudentPriceRequest(
  userId: string,
  db: Pick<PrismaClient, "studentPriceRequest"> = prisma
): Promise<StudentPriceRequest | null> {
  return db.studentPriceRequest.findUnique({ where: { userId } });
}

// ------------------------------------------------------------------- pricing

/** The price fields `priceForOffer` reads. `LIMELIGHT.plans` fits. */
export interface LimelightPrices {
  essential: { priceUsd: number; studentPriceUsd: number | null };
  signature: { priceUsd: number };
}

/**
 * What an offer costs this buyer, in cents.
 *
 * The student price exists on Essential only, for a buyer whose request an
 * admin approved, and only once the founders have set the amount
 * (`studentPriceUsd`). An amount that is not below the regular price is
 * ignored: it would be a configuration mistake, not a discount.
 *
 * `prices` is a parameter so the student case can be tested before the real
 * amount exists.
 */
export function priceForOffer(
  offer: LimelightOffer,
  opts: { studentApproved: boolean },
  prices: LimelightPrices = LIMELIGHT.plans
): { amountCents: number; studentDiscount: boolean } {
  const regular = prices[offer].priceUsd;
  if (offer === "essential" && opts.studentApproved) {
    const student = prices.essential.studentPriceUsd;
    if (
      typeof student === "number" &&
      Number.isFinite(student) &&
      student >= 0 &&
      student < regular
    ) {
      return { amountCents: Math.round(student * 100), studentDiscount: true };
    }
  }
  return { amountCents: Math.round(regular * 100), studentDiscount: false };
}

// --------------------------------------------------------------- fulfillment

/** The plan every Limelight purchase includes for `includedProMonths`. */
const INCLUDED_PLAN: PlanB2C = "PRO";

/**
 * Turn a paid order into what the buyer bought. Called right after the mock
 * checkout today and from the payment provider's webhook later; both may
 * call it more than once for the same order, so it is idempotent.
 *
 * One transaction, all or nothing:
 * - the order becomes PAID, with `paidAt` and the date hosting renews;
 * - a student price request that paid for this order becomes USED;
 * - the buyer's subscription gains the included Pro months;
 * - an audit entry records it.
 *
 * Returns the order as it stands afterwards, or null when no such order
 * exists. Only a PENDING order is fulfilled: one that is already PAID comes
 * back unchanged, and so does a CANCELED or REFUNDED one, which the caller
 * can tell from its status.
 */
export async function fulfillSiteOrder(
  db: Pick<PrismaClient, "$transaction">,
  orderId: string,
  opts: { now?: Date; providerPaymentId?: string } = {}
): Promise<SiteOrder | null> {
  const now = opts.now ?? new Date();

  return db.$transaction(async (tx) => {
    const order = await tx.siteOrder.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDING") return order;

    const paid = {
      status: "PAID",
      paidAt: now,
      hostingRenewsAt: addMonthsUtc(now, LIMELIGHT.hostingTermMonths),
      providerPaymentId: opts.providerPaymentId ?? order.providerPaymentId,
    };
    // The write applies only while the order is still PENDING. A second call
    // running at the same moment waits here for the first to commit, then
    // matches nothing and grants nothing.
    const { count } = await tx.siteOrder.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: paid,
    });
    if (count === 0) {
      return tx.siteOrder.findUnique({ where: { id: orderId } });
    }

    let compUntil: Date | null = null;
    // userId is null when the account was deleted between checkout and
    // payment: the order is still recorded as paid, with nobody to grant to.
    if (order.userId) {
      if (order.studentDiscount) {
        await tx.studentPriceRequest.updateMany({
          where: { userId: order.userId, status: "APPROVED" },
          data: { status: "USED", usedAt: now },
        });
      }

      // Create the subscription if the buyer has none, and take its row lock
      // either way: `update` rewrites a column to the value it always has.
      // Two orders of the same buyer paid at the same moment then extend the
      // Pro months one after the other, each from the end date the other
      // left, instead of both starting from the same one.
      const free = B2C_PLANS.FREE;
      const subscription = await tx.subscription.upsert({
        where: { subjectId: order.userId },
        create: {
          subjectType: "ARTIST",
          subjectId: order.userId,
          plan: free.plan,
          priceCents: free.priceCents,
          commissionRate: free.commissionRate,
        },
        update: { subjectType: "ARTIST" },
        select: { compUntil: true },
      });
      compUntil = extendComp(subscription.compUntil, now, LIMELIGHT.includedProMonths);
      await tx.subscription.update({
        where: { subjectId: order.userId },
        data: { compPlan: INCLUDED_PLAN, compUntil },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: order.userId,
        organizationId: null,
        action: "limelight.order.paid",
        resourceType: "SiteOrder",
        resourceId: order.id,
        before: JSON.stringify({ status: order.status }),
        after: JSON.stringify({
          status: paid.status,
          siteId: order.siteId,
          offer: order.offer,
          amountCents: order.amountCents,
          studentDiscount: order.studentDiscount,
          provider: order.provider,
          providerPaymentId: paid.providerPaymentId,
          hostingRenewsAt: paid.hostingRenewsAt,
          compPlan: compUntil ? INCLUDED_PLAN : null,
          compUntil,
        }),
      },
    });

    return { ...order, ...paid };
  });
}

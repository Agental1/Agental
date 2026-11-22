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
 * `listStudentPriceRequests`, `getSiteForOperator` and `listSitesForOperator`
 * belong on admin pages only.
 *
 * The database client is a parameter where a test needs to hand in a mock.
 */

// --------------------------------------------------------------------- reads

export interface SiteView {
  id: string;
  /** The customer: the account the site belongs to. */
  userId: string;
  template: string;
  status: string;
  subdomain: string | null;
  customDomain: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * The working draft, which is also the latest revision. Null when the
   * stored JSON no longer passes `SiteContent`.
   */
  content: SiteContent | null;
  /** The owner's choice to show contact details on the public site. */
  showContact: boolean;
  /** Version number of the newest revision. Null for a site saved before revisions existed. */
  latestVersion: number | null;
  /** The version the customer approved. Null until they approve one. */
  approvedVersion: number | null;
  approvedAt: Date | null;
  /** The version the public sees. Null while the site is offline. */
  publishedVersion: number | null;
  /** The latest paid order for this site. Null until one is paid. */
  paidOrder: {
    id: string;
    offer: string;
    paidAt: Date | null;
    hostingRenewsAt: Date | null;
  } | null;
}

type SiteDb = Pick<PrismaClient, "site" | "siteRevision">;

const siteViewInclude = {
  orders: {
    where: { status: "PAID" },
    orderBy: { paidAt: "desc" },
    take: 1,
    select: { id: true, offer: true, paidAt: true, hostingRenewsAt: true },
  },
  revisions: {
    orderBy: { version: "desc" },
    take: 1,
    select: { id: true, version: true },
  },
} as const;

interface SiteRow {
  id: string;
  userId: string;
  template: string;
  status: string;
  subdomain: string | null;
  customDomain: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  content: string;
  showContact: boolean;
  approvedRevisionId: string | null;
  approvedAt: Date | null;
  publishedRevisionId: string | null;
  orders: NonNullable<SiteView["paidOrder"]>[];
  revisions: { id: string; version: number }[];
}

/**
 * Rows to views. The approved and published revisions are often older than
 * the latest one, so their version numbers take one more query for the whole
 * list.
 */
async function toSiteViews(rows: SiteRow[], db: SiteDb): Promise<SiteView[]> {
  const versions = new Map<string, number>();
  for (const row of rows) {
    for (const revision of row.revisions) versions.set(revision.id, revision.version);
  }
  const missing = new Set<string>();
  for (const row of rows) {
    for (const id of [row.approvedRevisionId, row.publishedRevisionId]) {
      if (id && !versions.has(id)) missing.add(id);
    }
  }
  if (missing.size > 0) {
    const found = await db.siteRevision.findMany({
      where: { id: { in: [...missing] } },
      select: { id: true, version: true },
    });
    for (const revision of found) versions.set(revision.id, revision.version);
  }
  const versionOf = (id: string | null) => (id ? versions.get(id) ?? null : null);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    template: row.template,
    status: row.status,
    subdomain: row.subdomain,
    customDomain: row.customDomain,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    content: parseSiteContent(row.content),
    showContact: row.showContact,
    latestVersion: row.revisions[0]?.version ?? null,
    approvedVersion: versionOf(row.approvedRevisionId),
    approvedAt: row.approvedAt,
    publishedVersion: versionOf(row.publishedRevisionId),
    paidOrder: row.orders[0] ?? null,
  }));
}

/** The user's sites, oldest first, drafts included. */
export async function listMySites(
  userId: string,
  db: SiteDb = prisma
): Promise<SiteView[]> {
  const rows = await db.site.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: siteViewInclude,
  });
  return toSiteViews(rows, db);
}

/** One site, only if `userId` owns it. Null otherwise, whatever the reason. */
export async function getSiteForOwner(
  userId: string,
  siteId: string,
  db: SiteDb = prisma
): Promise<SiteView | null> {
  const row = await db.site.findFirst({
    where: { id: siteId, userId },
    include: siteViewInclude,
  });
  if (!row) return null;
  return (await toSiteViews([row], db))[0];
}

/**
 * Operator read: any site by id. It checks nobody, so call it only after
 * `currentAdminId()` (src/lib/limelight/admin.ts) answered an id.
 */
export async function getSiteForOperator(
  siteId: string,
  db: SiteDb = prisma
): Promise<SiteView | null> {
  const row = await db.site.findUnique({
    where: { id: siteId },
    include: siteViewInclude,
  });
  if (!row) return null;
  return (await toSiteViews([row], db))[0];
}

/** How many sites the operator list shows. */
const OPERATOR_SITES_SHOWN = 200;

/**
 * Operator read: the most recently edited sites of every customer. Same
 * rule as `getSiteForOperator`: admin pages only.
 */
export async function listSitesForOperator(db: SiteDb = prisma): Promise<SiteView[]> {
  const rows = await db.site.findMany({
    orderBy: { updatedAt: "desc" },
    take: OPERATOR_SITES_SHOWN,
    include: siteViewInclude,
  });
  return toSiteViews(rows, db);
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
  signature: { priceUsd: number; studentPriceUsd?: number | null };
}

/**
 * What an offer costs this buyer, in cents.
 *
 * The student price applies, for a buyer whose request an admin approved, on
 * an offer whose amount the founders have set (`studentPriceUsd`: Essential
 * $29 since round 8, Signature $69 since round 8b). An amount that is not below the regular price is
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
  if (opts.studentApproved) {
    const student = prices[offer].studentPriceUsd;
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

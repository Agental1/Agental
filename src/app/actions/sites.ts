"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { err, type ActionError } from "@/domain/action-result";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { findUsersByEmail } from "@/lib/auth/user-by-email";
import { getBilling, paidPlanAllowed } from "@/lib/billing";
import { fulfillSiteOrder, priceForOffer } from "@/lib/sites";
import { LimelightOffer } from "@/domain/limelight";
import {
  MAX_SITES_PER_USER,
  SiteInput,
  parseSiteContent,
  slugifySubdomain,
  subdomainCandidate,
} from "@/domain/site";

/**
 * Limelight sites: save a draft, pay for it, publish it, and the student
 * price. Contracts and error keys are listed in docs/LIMELIGHT_BACKEND.md.
 *
 * Every export here is a public endpoint. Each one authenticates, validates
 * its arguments with Zod whatever their TypeScript type says, and answers a
 * site that is not the caller's exactly as it answers a site that does not
 * exist.
 */

type Failure = { ok: false; error: ActionError };

export type SaveSiteResult = { ok: true; siteId: string } | Failure;
export type SiteCheckoutResult =
  | { ok: true; checkoutUrl?: string; alreadyPaid?: true }
  | Failure;
export type PublishSiteResult = { ok: true; subdomain: string } | Failure;
export type UnpublishSiteResult = { ok: true } | Failure;
/** `status` is the request's status after the call: PENDING, APPROVED, REJECTED or USED. */
export type StudentPriceResult = { ok: true; status: string } | Failure;

const Id = z.string().trim().min(1).max(64);
const CheckoutInput = z.object({ siteId: Id, offer: LimelightOffer });
const Decision = z.enum(["approve", "reject"]);
const Email = z.string().trim().toLowerCase().max(200).pipe(z.email());

function fail(key: ActionError["key"], values?: Record<string, string | number>): Failure {
  return { ok: false, error: err(key, values) };
}

async function talentUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return session.user.id;
}

/** The signed-in admin's id, or the failure to return. */
async function adminUserId(): Promise<string | Failure> {
  const session = await auth();
  if (!session?.user?.id) return fail("errors.unauthorized");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  return me?.isAdmin ? session.user.id : fail("errors.forbidden");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * The talent space layout, not one page: the site screens live under it, and
 * so do the dashboard, the plan page and the settings, which all show the Pro
 * months a purchase grants.
 */
function revalidateTalentSpace() {
  revalidatePath("/[locale]/talents/(space)", "layout");
}

/** The admin area lists student price requests. */
function revalidateAdmin() {
  revalidatePath("/[locale]/admin", "layout");
}

/**
 * Create a draft site, or update one the caller owns.
 *
 * Media ids that are not the caller's own profile media are dropped without
 * an error: the editor only ever offers the caller's media, so a foreign id
 * is a stale reference or someone probing, and neither deserves a detail.
 */
export async function saveSite(input: unknown): Promise<SaveSiteResult> {
  const userId = await talentUserId();
  if (!userId) return fail("errors.unauthorized");
  const parsed = SiteInput.safeParse(input);
  if (!parsed.success) return fail("errors.siteInvalid");
  const { siteId, template, content } = parsed.data;

  const wanted = [...new Set(content.mediaIds)];
  const owned =
    wanted.length === 0
      ? []
      : await prisma.media.findMany({
          where: { id: { in: wanted }, profile: { userId } },
          select: { id: true },
        });
  const ownedIds = new Set(owned.map((m) => m.id));
  const data = {
    template,
    content: JSON.stringify({
      ...content,
      mediaIds: wanted.filter((id) => ownedIds.has(id)),
    }),
  };

  if (siteId) {
    // The owner is part of the condition, so someone else's site matches
    // nothing and reads as missing.
    const { count } = await prisma.site.updateMany({
      where: { id: siteId, userId },
      data,
    });
    if (count === 0) return fail("errors.siteNotFound");
    revalidateTalentSpace();
    return { ok: true, siteId };
  }

  const existing = await prisma.site.count({ where: { userId } });
  if (existing >= MAX_SITES_PER_USER) {
    return fail("errors.siteLimitReached", { limit: MAX_SITES_PER_USER });
  }
  const site = await prisma.site.create({
    data: { userId, status: "DRAFT", ...data },
    select: { id: true },
  });
  revalidateTalentSpace();
  return { ok: true, siteId: site.id };
}

/**
 * Buy an offer for a site the caller owns.
 *
 * With the mock billing the order is paid and fulfilled before this returns.
 * With a real provider `checkoutUrl` is where to send the buyer, and the
 * order is fulfilled when the provider confirms the payment.
 *
 * A site that already has a paid order is not sold a second time: the answer
 * is `alreadyPaid` and nothing is created.
 */
export async function startSiteCheckout(input: {
  siteId: string;
  offer: LimelightOffer;
}): Promise<SiteCheckoutResult> {
  const userId = await talentUserId();
  if (!userId) return fail("errors.unauthorized");
  const parsed = CheckoutInput.safeParse(input);
  if (!parsed.success) return fail("errors.invalidInput");
  const { siteId, offer } = parsed.data;

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId },
    select: { id: true },
  });
  if (!site) return fail("errors.siteNotFound");

  const paidOrder = await prisma.siteOrder.findFirst({
    where: { siteId, status: "PAID" },
    select: { id: true },
  });
  if (paidOrder) return { ok: true, alreadyPaid: true };

  const request = await prisma.studentPriceRequest.findUnique({
    where: { userId },
    select: { status: true },
  });
  const { amountCents, studentDiscount } = priceForOffer(offer, {
    studentApproved: request?.status === "APPROVED",
  });

  // Before anything is written: where payments are off, no order exists.
  const billing = await getBilling();
  if (!paidPlanAllowed(billing, amountCents)) {
    return fail("errors.billingUnavailable");
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.siteOrder.create({
      data: {
        userId,
        siteId,
        offer,
        amountCents,
        currency: "USD",
        studentDiscount,
        status: "PENDING",
        provider: billing.live ? "stripe" : "mock",
      },
      select: { id: true },
    });
    await audit(
      {
        actorUserId: userId,
        action: "limelight.checkout.start",
        resourceType: "SiteOrder",
        resourceId: created.id,
        after: { siteId, offer, amountCents, studentDiscount },
      },
      tx
    );
    return created;
  });

  const checkout = await billing.checkoutSiteOrder({
    orderId: order.id,
    userId,
    amountCents,
    offer,
  });
  if (checkout.paid) await fulfillSiteOrder(prisma, order.id);

  revalidateTalentSpace();
  return { ok: true, checkoutUrl: checkout.checkoutUrl };
}

/** How many numbered names ("ana-lee-2", "ana-lee-3"...) are tried for one base. */
const SUBDOMAIN_ATTEMPTS = 25;

/**
 * Put a paid site online at its own subdomain.
 *
 * The subdomain comes from the name on the site. A site that was published
 * before keeps the one it had, so links to it survive an unpublish. When the
 * name gives nothing usable (a non-Latin script, a reserved word) the address
 * is "site-" plus the start of the site id.
 */
export async function publishSite(siteId: string): Promise<PublishSiteResult> {
  const userId = await talentUserId();
  if (!userId) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");

  const site = await prisma.site.findFirst({
    where: { id: id.data, userId },
    select: { id: true, status: true, subdomain: true, content: true },
  });
  if (!site) return fail("errors.siteNotFound");

  const paidOrder = await prisma.siteOrder.findFirst({
    where: { siteId: site.id, status: "PAID" },
    select: { id: true },
  });
  if (!paidOrder) return fail("errors.sitePaymentRequired");

  if (site.status === "PUBLISHED" && site.subdomain) {
    return { ok: true, subdomain: site.subdomain };
  }

  const content = parseSiteContent(site.content);
  if (!content) return fail("errors.siteInvalid");

  let names: string[];
  if (site.subdomain) {
    names = [site.subdomain];
  } else {
    const base =
      slugifySubdomain(content.name) ?? `site-${site.id.slice(0, 8).toLowerCase()}`;
    const candidates = Array.from({ length: SUBDOMAIN_ATTEMPTS }, (_, i) =>
      subdomainCandidate(base, i + 1)
    );
    const taken = await prisma.site.findMany({
      where: { subdomain: { in: candidates } },
      select: { subdomain: true },
    });
    const takenNames = new Set(taken.map((s) => s.subdomain));
    // Last resort, unique by construction: the whole site id.
    names = [
      ...candidates.filter((name) => !takenNames.has(name)),
      `site-${site.id.toLowerCase()}`,
    ];
  }

  const publishedAt = new Date();
  for (const subdomain of names) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.site.update({
          where: { id: site.id },
          data: { status: "PUBLISHED", publishedAt, subdomain },
        });
        await audit(
          {
            actorUserId: userId,
            action: "limelight.site.publish",
            resourceType: "Site",
            resourceId: site.id,
            before: { status: site.status, subdomain: site.subdomain },
            after: { status: "PUBLISHED", subdomain, publishedAt },
          },
          tx
        );
      });
      revalidateTalentSpace();
      return { ok: true, subdomain };
    } catch (error) {
      // Another site took this name between the lookup and the write: the
      // unique index on Site.subdomain refused it. Try the next one.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(`[limelight] no free subdomain for site ${site.id}`);
}

/** Take a site offline. It goes back to DRAFT and keeps its subdomain. */
export async function unpublishSite(siteId: string): Promise<UnpublishSiteResult> {
  const userId = await talentUserId();
  if (!userId) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");

  const { count } = await prisma.site.updateMany({
    where: { id: id.data, userId },
    data: { status: "DRAFT" },
  });
  if (count === 0) return fail("errors.siteNotFound");
  await audit({
    actorUserId: userId,
    action: "limelight.site.unpublish",
    resourceType: "Site",
    resourceId: id.data,
    after: { status: "DRAFT" },
  });
  revalidateTalentSpace();
  return { ok: true };
}

/**
 * Ask for the student price. One request per talent: asking again changes
 * nothing and answers with the status of the request that exists.
 */
export async function requestStudentPrice(): Promise<StudentPriceResult> {
  const userId = await talentUserId();
  if (!userId) return fail("errors.unauthorized");

  const request = await prisma.studentPriceRequest.upsert({
    where: { userId },
    create: { userId, status: "PENDING" },
    update: {},
    select: { status: true },
  });
  revalidateTalentSpace();
  revalidateAdmin();
  return { ok: true, status: request.status };
}

/**
 * Admin: approve or reject a student price request. A request that already
 * paid for an order (USED) is final and comes back as it is.
 */
export async function decideStudentPrice(
  requestId: string,
  decision: "approve" | "reject"
): Promise<StudentPriceResult> {
  const adminId = await adminUserId();
  if (typeof adminId !== "string") return adminId;
  const id = Id.safeParse(requestId);
  const choice = Decision.safeParse(decision);
  if (!id.success || !choice.success) return fail("errors.invalidInput");

  const request = await prisma.studentPriceRequest.findUnique({
    where: { id: id.data },
    select: { id: true, userId: true, status: true },
  });
  if (!request) return fail("errors.notFound");
  if (request.status === "USED") return { ok: true, status: request.status };

  const status = choice.data === "approve" ? "APPROVED" : "REJECTED";
  const decided = await prisma.$transaction(async (tx) => {
    // Not a USED request: an order paid a moment ago must keep it that way.
    const { count } = await tx.studentPriceRequest.updateMany({
      where: { id: request.id, status: { not: "USED" } },
      data: { status, decidedBy: adminId, decidedAt: new Date() },
    });
    if (count === 0) return false;
    await audit(
      {
        actorUserId: adminId,
        action: "limelight.student.decide",
        resourceType: "StudentPriceRequest",
        resourceId: request.id,
        before: { status: request.status },
        after: { status, userId: request.userId },
      },
      tx
    );
    return true;
  });

  revalidateAdmin();
  revalidateTalentSpace();
  return { ok: true, status: decided ? status : "USED" };
}

/**
 * Admin: approve the student price for the account behind an email address.
 * This is the manual path: the student sends proof by email, and may never
 * have clicked "request" in the app, so the request is created if missing.
 */
export async function approveStudentPriceByEmail(
  email: string
): Promise<StudentPriceResult> {
  const adminId = await adminUserId();
  if (typeof adminId !== "string") return adminId;
  const parsed = Email.safeParse(email);
  if (!parsed.success) return fail("errors.invalidInput");

  // In any letter case: see findUsersByEmail for why an exact lookup can miss.
  const [user] = await findUsersByEmail(prisma, parsed.data);
  if (!user) return fail("errors.notFound");

  const status = await prisma.$transaction(async (tx) => {
    const existing = await tx.studentPriceRequest.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    // The discount was already spent on an order. Approving again would
    // hand out a second one.
    if (existing?.status === "USED") return existing.status;

    const decision = { status: "APPROVED", decidedBy: adminId, decidedAt: new Date() };
    const request = await tx.studentPriceRequest.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...decision },
      update: decision,
      select: { id: true, status: true },
    });
    await audit(
      {
        actorUserId: adminId,
        action: "limelight.student.decide",
        resourceType: "StudentPriceRequest",
        resourceId: request.id,
        before: { status: existing?.status ?? null },
        after: { status: request.status, userId: user.id, via: "email" },
      },
      tx
    );
    return request.status;
  });

  revalidateAdmin();
  revalidateTalentSpace();
  return { ok: true, status };
}

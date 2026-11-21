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
import { LIMELIGHT, LimelightOffer } from "@/domain/limelight";
import {
  MAX_SITES_PER_USER,
  SiteInput,
  parseSiteContent,
  slugifySubdomain,
  subdomainCandidate,
} from "@/domain/site";
import { subdomainHostname } from "@/lib/limelight/hostname";
import {
  MAX_CUSTOM_DOMAINS_PER_SITE,
  checkDomainOwnership,
  customHostname,
  dnsRecordsFor,
  newVerificationToken,
  type DomainDnsRecords,
} from "@/lib/limelight/domains";

/**
 * Limelight sites: save a draft, approve its preview, publish it, connect a
 * domain, and (while payments are off, dormant) pay for it and the student
 * price. Contracts and error keys are listed in docs/LIMELIGHT_BACKEND.md.
 *
 * Two roles, both read from the session and the database, never from an
 * argument:
 * - the customer is the account the site belongs to;
 * - the operator is an admin. In the pilot the team assembles sites, so an
 *   operator may create and edit a customer's site, publish it and manage
 *   its domains. An operator may never approve a preview or change what
 *   contact details the site shows: those two belong to the customer alone.
 *
 * Every export here is a public endpoint. Each one authenticates, validates
 * its arguments with Zod whatever their TypeScript type says, and answers a
 * site that the caller may not touch exactly as it answers a site that does
 * not exist.
 */

type Failure = { ok: false; error: ActionError };

export type SaveSiteResult = { ok: true; siteId: string } | Failure;
export type SiteCheckoutResult =
  | { ok: true; checkoutUrl?: string; alreadyPaid?: true }
  | Failure;
export type ApproveSiteResult =
  | { ok: true; revisionId: string; version: number }
  | Failure;
export type PublishSiteResult = { ok: true; subdomain: string } | Failure;
export type UnpublishSiteResult = { ok: true } | Failure;
export type SiteContactResult = { ok: true; showContact: boolean } | Failure;
export type AddSiteDomainResult =
  | { ok: true; domainId: string; hostname: string; dns: DomainDnsRecords }
  | Failure;
/** `status` is the domain's status after the call: VERIFIED or ACTIVE. */
export type SiteDomainResult =
  | { ok: true; domainId: string; hostname: string; status: string }
  | Failure;
export type RemoveSiteDomainResult = { ok: true } | Failure;
/** `status` is the request's status after the call: PENDING, APPROVED, REJECTED or USED. */
export type StudentPriceResult = { ok: true; status: string } | Failure;

const Id = z.string().trim().min(1).max(64);
const CheckoutInput = z.object({ siteId: Id, offer: LimelightOffer });
const Decision = z.enum(["approve", "reject"]);
const Email = z.string().trim().toLowerCase().max(200).pipe(z.email());
const Version = z.number().int().min(1).max(1_000_000);

function fail(key: ActionError["key"], values?: Record<string, string | number>): Failure {
  return { ok: false, error: err(key, values) };
}

/** Thrown inside a transaction to roll it back and answer an error key. */
class Refused extends Error {
  constructor(readonly key: ActionError["key"]) {
    super(key);
  }
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

/** Who is calling a site action. */
interface Actor {
  id: string;
  kind: string | undefined;
  /** From the database, read at most once per action. */
  isAdmin(): Promise<boolean>;
}

/**
 * The caller of a site action: a talent (who may be a customer) or an admin
 * (the operator). Null for a visitor and for any other account, which the
 * actions answer with `errors.unauthorized`.
 */
async function siteActor(): Promise<Actor | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  let admin: Promise<boolean> | undefined;
  const actor: Actor = {
    id,
    kind: session.user.kind,
    isAdmin: () =>
      (admin ??= prisma.user
        .findUnique({ where: { id }, select: { isAdmin: true } })
        .then((me) => me?.isAdmin === true)),
  };
  if (actor.kind === "TALENT") return actor;
  return (await actor.isAdmin()) ? actor : null;
}

const siteAccessSelect = {
  id: true,
  userId: true,
  status: true,
  subdomain: true,
  template: true,
  content: true,
  approvedRevisionId: true,
  publishedRevisionId: true,
} as const;

interface SiteAccess {
  role: "customer" | "operator";
  site: {
    id: string;
    userId: string;
    status: string;
    subdomain: string | null;
    template: string;
    content: string;
    approvedRevisionId: string | null;
    publishedRevisionId: string | null;
  };
}

/**
 * The site, and what the caller is to it. Null when the caller is neither
 * its owner nor an admin, and when the site does not exist: the two cases
 * run the same queries and get the same answer.
 */
async function siteFor(actor: Actor, siteId: string): Promise<SiteAccess | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: siteAccessSelect,
  });
  if (site && site.userId === actor.id) return { role: "customer", site };
  if (!(await actor.isAdmin())) return null;
  return site ? { role: "operator", site } : null;
}

/**
 * The condition of a write on a site. A customer's write names the owner
 * again, so it matches nothing if the row changed hands in between.
 */
function writeScope(access: SiteAccess, actor: Actor) {
  return access.role === "customer"
    ? { id: access.site.id, userId: actor.id }
    : { id: access.site.id };
}

const domainAccessSelect = {
  id: true,
  siteId: true,
  hostname: true,
  kind: true,
  status: true,
  verificationToken: true,
  site: { select: { userId: true } },
} as const;

/** A domain the caller may manage: on their own site, or any for an admin. */
async function domainFor(actor: Actor, domainId: string) {
  const domain = await prisma.siteDomain.findUnique({
    where: { id: domainId },
    select: domainAccessSelect,
  });
  if (domain && domain.site.userId === actor.id) return domain;
  if (!(await actor.isAdmin())) return null;
  return domain;
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

/** The admin area lists student price requests and, for operators, sites. */
function revalidateAdmin() {
  revalidatePath("/[locale]/admin", "layout");
}

function revalidateSites() {
  revalidateTalentSpace();
  revalidateAdmin();
}

/**
 * Create a draft site, or update one. The customer saves their own site; an
 * operator saves any site, and opens a new one for a customer by passing
 * `ownerId`.
 *
 * Every save also writes a SiteRevision (the next version number of that
 * site, with a copy of the template and the content) in the same
 * transaction. The public page and the approval both point at revisions, so
 * saving never changes what is online or what was approved.
 *
 * Media ids that are not the site owner's own profile media are dropped
 * without an error: the editor only ever offers the owner's media, so a
 * foreign id is a stale reference or someone probing, and neither deserves a
 * detail.
 */
export async function saveSite(input: unknown): Promise<SaveSiteResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const parsed = SiteInput.safeParse(input);
  if (!parsed.success) return fail("errors.siteInvalid");
  const { siteId, template, content } = parsed.data;

  let access: SiteAccess | null = null;
  let ownerId: string;
  if (siteId) {
    access = await siteFor(actor, siteId);
    if (!access) return fail("errors.siteNotFound");
    ownerId = access.site.userId;
  } else if (parsed.data.ownerId && parsed.data.ownerId !== actor.id) {
    // A new site for someone else: operators only, for a talent account.
    if (!(await actor.isAdmin())) return fail("errors.forbidden");
    const owner = await prisma.user.findUnique({
      where: { id: parsed.data.ownerId },
      select: { id: true, kind: true },
    });
    if (!owner || owner.kind !== "TALENT") return fail("errors.notFound");
    ownerId = owner.id;
  } else {
    // A new site of one's own. An admin who is not a talent has no site of
    // their own to open: they name the customer.
    if (actor.kind !== "TALENT") return fail("errors.siteInvalid");
    ownerId = actor.id;
  }
  const byOperator = ownerId !== actor.id;

  const wanted = [...new Set(content.mediaIds)];
  const owned =
    wanted.length === 0
      ? []
      : await prisma.media.findMany({
          where: { id: { in: wanted }, profile: { userId: ownerId } },
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

  if (access) {
    const scope = writeScope(access, actor);
    const saved = await prisma.$transaction(async (tx) => {
      // The site row is written first, which locks it: two saves of the same
      // site take their version numbers one after the other.
      const { count } = await tx.site.updateMany({ where: scope, data });
      if (count === 0) return false;
      const last = await tx.siteRevision.findFirst({
        where: { siteId: scope.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      await tx.siteRevision.create({
        data: { siteId: scope.id, version, ...data, createdById: actor.id },
      });
      if (byOperator) {
        await audit(
          {
            actorUserId: actor.id,
            action: "limelight.site.operator_save",
            resourceType: "Site",
            resourceId: scope.id,
            after: { version, ownerId },
          },
          tx
        );
      }
      return true;
    });
    if (!saved) return fail("errors.siteNotFound");
    revalidateSites();
    return { ok: true, siteId: scope.id };
  }

  const existing = await prisma.site.count({ where: { userId: ownerId } });
  if (existing >= MAX_SITES_PER_USER) {
    return fail("errors.siteLimitReached", { limit: MAX_SITES_PER_USER });
  }
  const site = await prisma.$transaction(async (tx) => {
    const created = await tx.site.create({
      data: { userId: ownerId, status: "DRAFT", ...data },
      select: { id: true },
    });
    await tx.siteRevision.create({
      data: { siteId: created.id, version: 1, ...data, createdById: actor.id },
    });
    if (byOperator) {
      await audit(
        {
          actorUserId: actor.id,
          action: "limelight.site.operator_save",
          resourceType: "Site",
          resourceId: created.id,
          after: { version: 1, ownerId, created: true },
        },
        tx
      );
    }
    return created;
  });
  revalidateSites();
  return { ok: true, siteId: site.id };
}

/**
 * Buy an offer for a site the caller owns.
 *
 * Off during the beta: while `LIMELIGHT.paymentsEnabled` is false this
 * answers `errors.billingUnavailable` to every signed-in talent and reads or
 * writes nothing. The rest describes what happens once it is on.
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
  if (!LIMELIGHT.paymentsEnabled) return fail("errors.billingUnavailable");
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

/**
 * The customer approves the preview: the latest revision of their site
 * becomes the approved one. Only the site's owner may call this. An operator
 * gets `errors.forbidden`, whatever else they may do to the site.
 *
 * Pass `expectedVersion` (the `latestVersion` the preview page was rendered
 * from) to refuse the approval when someone saved in between: the answer is
 * then `errors.sitePreviewChanged`, nothing changes, and the page shows the new
 * preview. Without it, whatever is latest at the time of the call is
 * approved.
 *
 * A later save leaves the approval where it is, on the older revision.
 */
export async function approveSitePreview(
  siteId: string,
  expectedVersion?: number
): Promise<ApproveSiteResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");
  const expected = Version.optional().safeParse(expectedVersion);
  if (!expected.success) return fail("errors.invalidInput");

  const access = await siteFor(actor, id.data);
  if (!access) return fail("errors.siteNotFound");
  if (access.role !== "customer") return fail("errors.forbidden");
  const { site } = access;

  try {
    const approved = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      // Written first to lock the site row: a save running at the same
      // moment waits, so "latest" below cannot move under the approval.
      const { count } = await tx.site.updateMany({
        where: { id: site.id, userId: actor.id },
        data: { approvedAt, approvedById: actor.id },
      });
      if (count === 0) throw new Refused("errors.siteNotFound");

      let revision = await tx.siteRevision.findFirst({
        where: { siteId: site.id },
        orderBy: { version: "desc" },
        select: { id: true, version: true, content: true },
      });
      // A site saved before revisions existed has none: its draft becomes
      // version 1.
      revision ??= await tx.siteRevision.create({
        data: {
          siteId: site.id,
          version: 1,
          template: site.template,
          content: site.content,
          createdById: actor.id,
        },
        select: { id: true, version: true, content: true },
      });
      if (!parseSiteContent(revision.content)) throw new Refused("errors.siteInvalid");
      if (expected.data !== undefined && expected.data !== revision.version) {
        throw new Refused("errors.sitePreviewChanged");
      }

      await tx.site.update({
        where: { id: site.id },
        data: { approvedRevisionId: revision.id },
      });
      await audit(
        {
          actorUserId: actor.id,
          action: "limelight.site.approve",
          resourceType: "Site",
          resourceId: site.id,
          before: { approvedRevisionId: site.approvedRevisionId },
          after: { approvedRevisionId: revision.id, version: revision.version, approvedAt },
        },
        tx
      );
      return { revisionId: revision.id, version: revision.version };
    });
    revalidateSites();
    return { ok: true, ...approved };
  } catch (error) {
    if (error instanceof Refused) return fail(error.key);
    throw error;
  }
}

/** How many numbered names ("ana-lee-2", "ana-lee-3"...) are tried for one base. */
const SUBDOMAIN_ATTEMPTS = 25;

/**
 * The SiteDomain row of the hosted subdomain: `<subdomain>.<root domain>`,
 * ACTIVE from the start, since the platform owns that name. Nothing is
 * written while LIMELIGHT_ROOT_DOMAIN is unset.
 */
async function ensureSubdomainDomain(
  db: Pick<typeof prisma, "siteDomain">,
  siteId: string,
  subdomain: string
): Promise<string | null> {
  const hostname = subdomainHostname(subdomain);
  if (!hostname) return null;
  const now = new Date();
  await db.siteDomain.upsert({
    where: { hostname },
    create: {
      siteId,
      hostname,
      kind: "SUBDOMAIN",
      status: "ACTIVE",
      verificationToken: "",
      verifiedAt: now,
    },
    update: { siteId, kind: "SUBDOMAIN", status: "ACTIVE" },
  });
  return hostname;
}

/**
 * Put the APPROVED revision of a site online. The customer or an operator
 * may call it, and only once the customer approved a revision
 * (`errors.siteNotApproved` otherwise). The working draft is never what goes
 * public: edits made after the approval stay private until the customer
 * approves again and the site is published again.
 *
 * During the beta no order is needed. With `LIMELIGHT.paymentsEnabled` on, a
 * paid order is required as well (`errors.sitePaymentRequired`).
 *
 * The subdomain comes from the name on the approved revision. A site that
 * was published before keeps the one it had, so links to it survive an
 * unpublish. When the name gives nothing usable (a non-Latin script, a
 * reserved word) the address is "site-" plus the start of the site id. With
 * LIMELIGHT_ROOT_DOMAIN set, the hostname `<subdomain>.<root domain>` is
 * recorded as an ACTIVE SiteDomain, which is what makes the site resolve.
 */
export async function publishSite(siteId: string): Promise<PublishSiteResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");

  const access = await siteFor(actor, id.data);
  if (!access) return fail("errors.siteNotFound");
  const { site } = access;

  if (LIMELIGHT.paymentsEnabled) {
    const paidOrder = await prisma.siteOrder.findFirst({
      where: { siteId: site.id, status: "PAID" },
      select: { id: true },
    });
    if (!paidOrder) return fail("errors.sitePaymentRequired");
  }

  if (!site.approvedRevisionId) return fail("errors.siteNotApproved");
  // The site id is part of the condition: an approval can only ever point at
  // one of this site's own revisions.
  const revision = await prisma.siteRevision.findFirst({
    where: { id: site.approvedRevisionId, siteId: site.id },
    select: { id: true, version: true, content: true },
  });
  if (!revision) return fail("errors.siteNotApproved");
  const content = parseSiteContent(revision.content);
  if (!content) return fail("errors.siteInvalid");

  if (
    site.status === "PUBLISHED" &&
    site.subdomain &&
    site.publishedRevisionId === revision.id
  ) {
    // Already online with this revision. The hostname row is still checked:
    // the root domain may have been configured after the first publication.
    await ensureSubdomainDomain(prisma, site.id, site.subdomain);
    return { ok: true, subdomain: site.subdomain };
  }

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
        // Only while this revision is still the approved one, and for a
        // customer only while the site is still theirs.
        const { count } = await tx.site.updateMany({
          where: { ...writeScope(access, actor), approvedRevisionId: revision.id },
          data: {
            status: "PUBLISHED",
            publishedAt,
            subdomain,
            publishedRevisionId: revision.id,
          },
        });
        if (count === 0) throw new Refused("errors.siteNotApproved");
        const hostname = await ensureSubdomainDomain(tx, site.id, subdomain);
        await audit(
          {
            actorUserId: actor.id,
            action: "limelight.site.publish",
            resourceType: "Site",
            resourceId: site.id,
            before: {
              status: site.status,
              subdomain: site.subdomain,
              publishedRevisionId: site.publishedRevisionId,
            },
            after: {
              status: "PUBLISHED",
              subdomain,
              hostname,
              publishedRevisionId: revision.id,
              version: revision.version,
              publishedAt,
              by: access.role,
            },
          },
          tx
        );
      });
      revalidateSites();
      return { ok: true, subdomain };
    } catch (error) {
      if (error instanceof Refused) return fail(error.key);
      // Another site took this name between the lookup and the write: the
      // unique index on Site.subdomain refused it. Try the next one.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error(`[limelight] no free subdomain for site ${site.id}`);
}

/**
 * Take a site offline: back to DRAFT with no published revision, so its
 * hostnames stop resolving at once. The customer or an operator may call it.
 * The subdomain, the domains and the approval are kept, so publishing again
 * brings back the same address with the approved revision.
 */
export async function unpublishSite(siteId: string): Promise<UnpublishSiteResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");

  const access = await siteFor(actor, id.data);
  if (!access) return fail("errors.siteNotFound");
  const { site } = access;

  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.site.updateMany({
      where: writeScope(access, actor),
      data: { status: "DRAFT", publishedRevisionId: null },
    });
    if (count === 0) return false;
    await audit(
      {
        actorUserId: actor.id,
        action: "limelight.site.unpublish",
        resourceType: "Site",
        resourceId: site.id,
        before: { status: site.status, publishedRevisionId: site.publishedRevisionId },
        after: { status: "DRAFT", publishedRevisionId: null, by: access.role },
      },
      tx
    );
    return true;
  });
  if (!done) return fail("errors.siteNotFound");
  revalidateSites();
  return { ok: true };
}

/**
 * The customer's switch for contact details on the public site. Owner only:
 * an operator gets `errors.forbidden`. It applies to the published site at
 * once, with no new approval, because it only ever hides or shows what the
 * approved revision already holds.
 */
export async function setSiteContactVisibility(
  siteId: string,
  show: boolean
): Promise<SiteContactResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");
  const wanted = z.boolean().safeParse(show);
  if (!wanted.success) return fail("errors.invalidInput");

  const access = await siteFor(actor, id.data);
  if (!access) return fail("errors.siteNotFound");
  if (access.role !== "customer") return fail("errors.forbidden");

  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.site.updateMany({
      where: { id: access.site.id, userId: actor.id },
      data: { showContact: wanted.data },
    });
    if (count === 0) return false;
    await audit(
      {
        actorUserId: actor.id,
        action: "limelight.site.contact_visibility",
        resourceType: "Site",
        resourceId: access.site.id,
        after: { showContact: wanted.data },
      },
      tx
    );
    return true;
  });
  if (!done) return fail("errors.siteNotFound");
  revalidateSites();
  return { ok: true, showContact: wanted.data };
}

// ------------------------------------------------------------ custom domains

/**
 * Connect a domain the customer owns to a site. The customer or an operator
 * may call it. The answer carries the two DNS records to create at the
 * customer's registrar; the domain stays PENDING until `verifySiteDomain`
 * finds the TXT record.
 *
 * Adding a domain that is already on this site answers the same records
 * again. A hostname held by another site, whatever its status, is
 * `errors.domainTaken`. A site may hold five custom domains
 * (`errors.domainLimitReached` past that).
 */
export async function addSiteDomain(
  siteId: string,
  hostname: string
): Promise<AddSiteDomainResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(siteId);
  if (!id.success) return fail("errors.siteNotFound");

  const access = await siteFor(actor, id.data);
  if (!access) return fail("errors.siteNotFound");
  const { site } = access;

  const host = customHostname(hostname);
  if (!host) return fail("errors.domainInvalid");

  const existing = await prisma.siteDomain.findUnique({
    where: { hostname: host },
    select: { id: true, siteId: true, kind: true, verificationToken: true },
  });
  if (existing) {
    if (existing.siteId !== site.id || existing.kind !== "CUSTOM") {
      return fail("errors.domainTaken");
    }
    return {
      ok: true,
      domainId: existing.id,
      hostname: host,
      dns: dnsRecordsFor(host, existing.verificationToken),
    };
  }

  const held = await prisma.siteDomain.count({
    where: { siteId: site.id, kind: "CUSTOM" },
  });
  if (held >= MAX_CUSTOM_DOMAINS_PER_SITE) {
    return fail("errors.domainLimitReached", { limit: MAX_CUSTOM_DOMAINS_PER_SITE });
  }

  const token = newVerificationToken();
  try {
    const domain = await prisma.$transaction(async (tx) => {
      const created = await tx.siteDomain.create({
        data: {
          siteId: site.id,
          hostname: host,
          kind: "CUSTOM",
          status: "PENDING",
          verificationToken: token,
        },
        select: { id: true },
      });
      await audit(
        {
          actorUserId: actor.id,
          action: "limelight.domain.add",
          resourceType: "SiteDomain",
          resourceId: created.id,
          after: { siteId: site.id, hostname: host, by: access.role },
        },
        tx
      );
      return created;
    });
    revalidateSites();
    return {
      ok: true,
      domainId: domain.id,
      hostname: host,
      dns: dnsRecordsFor(host, token),
    };
  } catch (error) {
    // Someone added the same hostname in the same instant.
    if (isUniqueViolation(error)) return fail("errors.domainTaken");
    throw error;
  }
}

/**
 * Look up the TXT record of a custom domain. On a match the domain becomes
 * VERIFIED; otherwise the answer is `errors.domainNotVerified` and the
 * customer tries again later (DNS changes can take hours to show). The
 * customer or an operator may call it.
 */
export async function verifySiteDomain(domainId: string): Promise<SiteDomainResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(domainId);
  if (!id.success) return fail("errors.notFound");

  const domain = await domainFor(actor, id.data);
  if (!domain) return fail("errors.notFound");

  const check = await checkDomainOwnership(domain);
  if (!check.verified) {
    revalidateSites();
    return fail("errors.domainNotVerified");
  }
  if (check.status !== domain.status) {
    await audit({
      actorUserId: actor.id,
      action: "limelight.domain.verify",
      resourceType: "SiteDomain",
      resourceId: domain.id,
      before: { status: domain.status },
      after: { status: check.status, siteId: domain.siteId },
    });
    revalidateSites();
  }
  return { ok: true, domainId: domain.id, hostname: domain.hostname, status: check.status };
}

/**
 * Operator only: mark a VERIFIED domain ACTIVE, once it has been attached to
 * the project in the hosting dashboard. That attachment is done by hand: no
 * code here calls the hosting provider. Only an ACTIVE domain serves a site.
 * A domain that is not verified yet is `errors.domainNotVerified`.
 */
export async function activateSiteDomain(domainId: string): Promise<SiteDomainResult> {
  const adminId = await adminUserId();
  if (typeof adminId !== "string") return adminId;
  const id = Id.safeParse(domainId);
  if (!id.success) return fail("errors.notFound");

  const domain = await prisma.siteDomain.findUnique({
    where: { id: id.data },
    select: { id: true, siteId: true, hostname: true, status: true },
  });
  if (!domain) return fail("errors.notFound");
  if (domain.status === "ACTIVE") {
    return { ok: true, domainId: domain.id, hostname: domain.hostname, status: "ACTIVE" };
  }
  if (domain.status !== "VERIFIED") return fail("errors.domainNotVerified");

  const activated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.siteDomain.updateMany({
      where: { id: domain.id, status: "VERIFIED" },
      data: { status: "ACTIVE" },
    });
    if (count === 0) return false;
    await audit(
      {
        actorUserId: adminId,
        action: "limelight.domain.activate",
        resourceType: "SiteDomain",
        resourceId: domain.id,
        before: { status: "VERIFIED" },
        after: { status: "ACTIVE", siteId: domain.siteId, hostname: domain.hostname },
      },
      tx
    );
    return true;
  });
  if (!activated) return fail("errors.domainNotVerified");
  revalidateSites();
  return { ok: true, domainId: domain.id, hostname: domain.hostname, status: "ACTIVE" };
}

/**
 * Disconnect a custom domain from a site. The customer or an operator may
 * call it. The hosted subdomain is not removed this way (`errors.forbidden`):
 * it follows the site. The row is deleted here only; an operator still
 * detaches the domain in the hosting dashboard.
 */
export async function removeSiteDomain(domainId: string): Promise<RemoveSiteDomainResult> {
  const actor = await siteActor();
  if (!actor) return fail("errors.unauthorized");
  const id = Id.safeParse(domainId);
  if (!id.success) return fail("errors.notFound");

  const domain = await domainFor(actor, id.data);
  if (!domain) return fail("errors.notFound");
  if (domain.kind !== "CUSTOM") return fail("errors.forbidden");

  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.siteDomain.deleteMany({
      where: { id: domain.id, siteId: domain.siteId, kind: "CUSTOM" },
    });
    if (count === 0) return false;
    await audit(
      {
        actorUserId: actor.id,
        action: "limelight.domain.remove",
        resourceType: "SiteDomain",
        resourceId: domain.id,
        before: { siteId: domain.siteId, hostname: domain.hostname, status: domain.status },
      },
      tx
    );
    return true;
  });
  if (!removed) return fail("errors.notFound");
  revalidateSites();
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

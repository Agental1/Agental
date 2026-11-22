import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Limelight sites with a mocked Prisma: the price of an offer, what a paid
 * order grants, who may call each action, and the gate in front of the
 * public page (a revision the customer approved, and nothing else).
 *
 * What is under test is the decision and the shape of the writes: a site
 * that is not the caller's reads as missing; every save writes a revision;
 * only the customer approves; only an approved revision is published; an
 * order is fulfilled once, in one transaction, with its audit entry. That
 * the conditional writes hold in Postgres is checked against a database in
 * tests/api/limelight-sites.test.ts.
 */

const tx = {
  site: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  siteRevision: { create: vi.fn(), findFirst: vi.fn() },
  siteDomain: { create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  siteOrder: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  studentPriceRequest: { findUnique: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  subscription: { upsert: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
};
// Outside a transaction the actions may read, and write only what is listed
// here. Anything else hits a missing method and fails the test.
const db = {
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  media: { findMany: vi.fn() },
  site: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  siteRevision: { findFirst: vi.fn() },
  siteDomain: { count: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
  siteOrder: { findFirst: vi.fn() },
  studentPriceRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const auth = vi.fn();
const revalidatePath = vi.fn();
const resolveTxt = vi.fn();
// The release switch for payments is a constant in the domain file. Tests
// flip this stand-in to cover both sides of it.
const flags = vi.hoisted(() => ({ paymentsEnabled: false }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("node:dns/promises", () => ({ resolveTxt }));
vi.mock("@/domain/limelight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/limelight")>();
  return {
    ...actual,
    LIMELIGHT: {
      ...actual.LIMELIGHT,
      get paymentsEnabled() {
        return flags.paymentsEnabled;
      },
    },
  };
});

const { fulfillSiteOrder, priceForOffer } = await import("@/lib/sites");
const {
  activateSiteDomain,
  addSiteDomain,
  approveSitePreview,
  approveStudentPriceByEmail,
  decideStudentPrice,
  publishSite,
  removeSiteDomain,
  requestStudentPrice,
  saveSite,
  setSiteContactVisibility,
  startSiteCheckout,
  unpublishSite,
  verifySiteDomain,
} = await import("@/app/actions/sites");

const now = new Date("2026-11-19T10:00:00Z");
const validSite = { template: "marquee", content: { name: "Ana Lee" } };
const SITE = "cmwsite0001abcdefgh";

function signIn(kind: "TALENT" | "CASTING", id = "u1") {
  auth.mockResolvedValue({ user: { id, kind } });
}

/** The accounts that exist. Every other id reads as a missing user. */
function accounts(known: Record<string, { isAdmin?: boolean; kind?: string }>) {
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const user = known[where.id];
    return user ? { id: where.id, isAdmin: user.isAdmin ?? false, kind: user.kind ?? "TALENT" } : null;
  });
}

function signInAdmin(isAdmin: boolean) {
  signIn("CASTING", "admin1");
  db.user.findUnique.mockResolvedValue({ isAdmin });
}

/** The operator: an admin who owns none of the sites in these tests. */
function signInOperator() {
  signIn("CASTING", "op1");
  accounts({ op1: { isAdmin: true, kind: "CASTING" }, u1: {}, u2: {} });
}

/** A Site row as the actions read it. Owned by u1 unless said otherwise. */
function siteRow(over: Record<string, unknown> = {}) {
  return {
    id: SITE,
    userId: "u1",
    status: "DRAFT",
    subdomain: null,
    template: "marquee",
    content: JSON.stringify({ name: "Working Draft" }),
    approvedRevisionId: null,
    publishedRevisionId: null,
    ...over,
  };
}

function pendingOrder(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    userId: "u1",
    siteId: "s1",
    offer: "essential",
    amountCents: 9900,
    currency: "USD",
    studentDiscount: false,
    status: "PENDING",
    provider: "mock",
    providerSessionId: null,
    providerPaymentId: null,
    paidAt: null,
    hostingRenewsAt: null,
    createdAt: new Date("2026-11-19T09:55:00Z"),
    ...over,
  };
}

type AuditData = {
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before: string;
  after: string;
};

function audits(client: { auditLog: { create: ReturnType<typeof vi.fn> } } = tx): AuditData[] {
  return client.auditLog.create.mock.calls.map(
    (call) => (call as [{ data: AuditData }])[0].data
  );
}

function expectNoWrites() {
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(db.siteDomain.upsert).not.toHaveBeenCalled();
  expect(db.siteDomain.updateMany).not.toHaveBeenCalled();
  expect(db.studentPriceRequest.upsert).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  // Back to the implementations given to vi.fn above, queued values dropped.
  vi.resetAllMocks();
  flags.paymentsEnabled = false;
  vi.stubEnv("LIMELIGHT_ROOT_DOMAIN", "");
  vi.stubEnv("LIMELIGHT_CNAME_TARGET", "");
  vi.stubEnv("LIMELIGHT_APP_HOSTS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("priceForOffer", () => {
  const withStudentPrice = {
    essential: { priceUsd: 99, studentPriceUsd: 59 },
    signature: { priceUsd: 199 },
  };

  it("charges the launch prices", () => {
    expect(priceForOffer("essential", { studentApproved: false })).toEqual({
      amountCents: 9900,
      studentDiscount: false,
    });
    expect(priceForOffer("signature", { studentApproved: false })).toEqual({
      amountCents: 14900,
      studentDiscount: false,
    });
  });

  it("charges an approved student the round 8 student price ($29)", () => {
    expect(priceForOffer("essential", { studentApproved: true })).toEqual({
      amountCents: 2900,
      studentDiscount: true,
    });
  });

  it("gives the student price on Essential to an approved student", () => {
    expect(priceForOffer("essential", { studentApproved: true }, withStudentPrice)).toEqual({
      amountCents: 5900,
      studentDiscount: true,
    });
  });

  it("charges an approved student the round 8b Signature price ($69)", () => {
    expect(priceForOffer("signature", { studentApproved: true })).toEqual({
      amountCents: 6900,
      studentDiscount: true,
    });
  });

  it("never gives it without approval, nor on an offer without a student price", () => {
    expect(priceForOffer("essential", { studentApproved: false }, withStudentPrice)).toEqual({
      amountCents: 9900,
      studentDiscount: false,
    });
    expect(priceForOffer("signature", { studentApproved: true }, withStudentPrice)).toEqual({
      amountCents: 19900,
      studentDiscount: false,
    });
  });

  it.each([99, 150, -1, Number.NaN])("ignores a student price of %s, which is no discount", (studentPriceUsd) => {
    const prices = { ...withStudentPrice, essential: { priceUsd: 99, studentPriceUsd } };
    expect(priceForOffer("essential", { studentApproved: true }, prices)).toEqual({
      amountCents: 9900,
      studentDiscount: false,
    });
  });
});

describe("fulfillSiteOrder", () => {
  it("marks the order paid, grants four months of Pro and audits it, in one transaction", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.subscription.upsert.mockResolvedValue({ compUntil: null });

    const order = await fulfillSiteOrder(db as never, "o1", { now, providerPaymentId: "pi_123" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.siteOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: now,
        hostingRenewsAt: new Date("2027-11-19T10:00:00Z"),
        providerPaymentId: "pi_123",
      },
    });
    expect(tx.subscription.upsert).toHaveBeenCalledWith({
      where: { subjectId: "u1" },
      create: {
        subjectType: "ARTIST",
        subjectId: "u1",
        plan: "FREE",
        priceCents: 0,
        commissionRate: 0.1,
      },
      update: { subjectType: "ARTIST" },
      select: { compUntil: true },
    });
    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { subjectId: "u1" },
      data: { compPlan: "PRO", compUntil: new Date("2027-03-19T10:00:00Z") },
    });
    expect(tx.studentPriceRequest.updateMany).not.toHaveBeenCalled();

    // The audit entry goes through the transaction client, after the grant.
    expect(audits()).toHaveLength(1);
    expect(audits()[0]).toMatchObject({
      actorUserId: "u1",
      action: "limelight.order.paid",
      resourceType: "SiteOrder",
      resourceId: "o1",
    });
    expect(JSON.parse(audits()[0].after)).toMatchObject({
      status: "PAID",
      offer: "essential",
      amountCents: 9900,
      studentDiscount: false,
      providerPaymentId: "pi_123",
      compPlan: "PRO",
      compUntil: "2027-03-19T10:00:00.000Z",
      hostingRenewsAt: "2027-11-19T10:00:00.000Z",
    });
    expect(tx.auditLog.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.subscription.update.mock.invocationCallOrder[0]
    );
    expect(db.auditLog.create).not.toHaveBeenCalled();

    expect(order).toMatchObject({
      id: "o1",
      status: "PAID",
      paidAt: now,
      hostingRenewsAt: new Date("2027-11-19T10:00:00Z"),
      providerPaymentId: "pi_123",
    });
  });

  it("returns a paid order unchanged on a second call", async () => {
    const paid = pendingOrder({
      status: "PAID",
      paidAt: now,
      hostingRenewsAt: new Date("2027-11-19T10:00:00Z"),
    });
    tx.siteOrder.findUnique.mockResolvedValue(paid);

    const later = new Date("2026-12-25T00:00:00Z");
    expect(await fulfillSiteOrder(db as never, "o1", { now: later })).toBe(paid);

    expect(tx.siteOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.studentPriceRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("grants nothing when another call paid the order first", async () => {
    // Both calls read PENDING; only one conditional write matches.
    const paid = pendingOrder({ status: "PAID", paidAt: now });
    tx.siteOrder.findUnique.mockResolvedValueOnce(pendingOrder()).mockResolvedValueOnce(paid);
    tx.siteOrder.updateMany.mockResolvedValue({ count: 0 });

    expect(await fulfillSiteOrder(db as never, "o1", { now })).toBe(paid);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(["CANCELED", "REFUNDED"])("leaves a %s order alone", async (status) => {
    const order = pendingOrder({ status });
    tx.siteOrder.findUnique.mockResolvedValue(order);

    expect(await fulfillSiteOrder(db as never, "o1", { now })).toBe(order);
    expect(tx.siteOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it("answers null for an order that does not exist", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(null);
    expect(await fulfillSiteOrder(db as never, "nope", { now })).toBeNull();
    expect(tx.siteOrder.updateMany).not.toHaveBeenCalled();
  });

  it("marks the student price request used when the order had the student price", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(
      pendingOrder({ studentDiscount: true, amountCents: 5900 })
    );
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.subscription.upsert.mockResolvedValue({ compUntil: null });

    await fulfillSiteOrder(db as never, "o1", { now });

    expect(tx.studentPriceRequest.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "APPROVED" },
      data: { status: "USED", usedAt: now },
    });
    expect(JSON.parse(audits()[0].after)).toMatchObject({ studentDiscount: true, amountCents: 5900 });
  });

  it("adds the months to included Pro that is still running", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    // A first site bought earlier: Pro is included until the end of January.
    tx.subscription.upsert.mockResolvedValue({ compUntil: new Date("2027-01-31T08:00:00Z") });

    await fulfillSiteOrder(db as never, "o1", { now });

    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { subjectId: "u1" },
      data: { compPlan: "PRO", compUntil: new Date("2027-05-31T08:00:00Z") },
    });
  });

  it("starts again from today when the included Pro already ended", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.subscription.upsert.mockResolvedValue({ compUntil: new Date("2026-03-01T00:00:00Z") });

    await fulfillSiteOrder(db as never, "o1", { now });

    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { subjectId: "u1" },
      data: { compPlan: "PRO", compUntil: new Date("2027-03-19T10:00:00Z") },
    });
  });

  it("records the payment of an order whose account is gone, and grants nothing", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder({ userId: null, studentDiscount: true }));
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });

    const order = await fulfillSiteOrder(db as never, "o1", { now });

    expect(order?.status).toBe("PAID");
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.studentPriceRequest.updateMany).not.toHaveBeenCalled();
    expect(audits()[0].actorUserId).toBeNull();
    expect(JSON.parse(audits()[0].after)).toMatchObject({ compPlan: null, compUntil: null });
  });

  it("lets a failed write escape the transaction, so the order is not half fulfilled", async () => {
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.subscription.upsert.mockRejectedValue(new Error("connection reset"));

    await expect(fulfillSiteOrder(db as never, "o1", { now })).rejects.toThrow("connection reset");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("site actions: who may call them", () => {
  type Call = () => Promise<{ ok: boolean; error?: unknown }>;
  const siteActions: Array<[string, Call]> = [
    ["saveSite", () => saveSite(validSite)],
    ["approveSitePreview", () => approveSitePreview("s1")],
    ["publishSite", () => publishSite("s1")],
    ["unpublishSite", () => unpublishSite("s1")],
    ["setSiteContactVisibility", () => setSiteContactVisibility("s1", true)],
    ["addSiteDomain", () => addSiteDomain("s1", "www.ana-lee.com")],
    ["verifySiteDomain", () => verifySiteDomain("d1")],
    ["removeSiteDomain", () => removeSiteDomain("d1")],
  ];
  const talentActions: Array<[string, Call]> = [
    ["startSiteCheckout", () => startSiteCheckout({ siteId: "s1", offer: "essential" })],
    ["requestStudentPrice", () => requestStudentPrice()],
  ];
  const adminActions: Array<[string, Call]> = [
    ["decideStudentPrice", () => decideStudentPrice("r1", "approve")],
    ["approveStudentPriceByEmail", () => approveStudentPriceByEmail("ana@example.com")],
    ["activateSiteDomain", () => activateSiteDomain("d1")],
  ];

  function expectNothingRead() {
    expect(db.site.findUnique).not.toHaveBeenCalled();
    expect(db.site.findFirst).not.toHaveBeenCalled();
    expect(db.siteDomain.findUnique).not.toHaveBeenCalled();
  }

  it.each([...siteActions, ...talentActions, ...adminActions])(
    "%s refuses a visitor who is not signed in",
    async (_name, call) => {
      auth.mockResolvedValue(null);
      expect(await call()).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
      expectNoWrites();
      expectNothingRead();
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  );

  it.each([...siteActions, ...talentActions])(
    "%s refuses a casting account that is not an admin",
    async (_name, call) => {
      signIn("CASTING");
      accounts({ u1: { isAdmin: false, kind: "CASTING" } });
      expect(await call()).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
      expectNoWrites();
      expectNothingRead();
    }
  );

  it.each(adminActions)("%s refuses a signed-in user who is not an admin", async (_name, call) => {
    signIn("TALENT");
    db.user.findUnique.mockResolvedValue({ isAdmin: false });
    expect(await call()).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { isAdmin: true, email: true },
    });
    expectNoWrites();
    expect(db.studentPriceRequest.findUnique).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.siteDomain.findUnique).not.toHaveBeenCalled();
  });

  it.each(adminActions)("%s refuses a session whose user row is gone", async (_name, call) => {
    signIn("TALENT");
    db.user.findUnique.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expectNoWrites();
  });

  const onSomeoneElsesSite: Array<[string, Call]> = [
    ["saveSite", () => saveSite({ ...validSite, siteId: SITE })],
    ["approveSitePreview", () => approveSitePreview(SITE)],
    ["publishSite", () => publishSite(SITE)],
    ["unpublishSite", () => unpublishSite(SITE)],
    ["setSiteContactVisibility", () => setSiteContactVisibility(SITE, true)],
    ["addSiteDomain", () => addSiteDomain(SITE, "www.ana-lee.com")],
  ];

  it.each(onSomeoneElsesSite)(
    "%s answers a site that belongs to another customer exactly like a missing one",
    async (_name, call) => {
      signIn("TALENT", "u2");
      accounts({ u1: {}, u2: {} });

      db.site.findUnique.mockResolvedValue(siteRow({ approvedRevisionId: "rev1" }));
      const theirs = await call();
      const readsForTheirs = [db.site.findUnique.mock.calls.length, db.user.findUnique.mock.calls.length];
      expectNoWrites();

      db.site.findUnique.mockClear();
      db.user.findUnique.mockClear();
      db.site.findUnique.mockResolvedValue(null);
      const missing = await call();

      expect(theirs).toEqual({ ok: false, error: { key: "errors.siteNotFound" } });
      expect(missing).toEqual(theirs);
      // Same queries either way: nothing in the timing tells the two apart.
      expect([db.site.findUnique.mock.calls.length, db.user.findUnique.mock.calls.length]).toEqual(readsForTheirs);
      expectNoWrites();
    }
  );

  it.each([
    ["verifySiteDomain", () => verifySiteDomain("d1")],
    ["removeSiteDomain", () => removeSiteDomain("d1")],
  ] as Array<[string, Call]>)("%s answers another customer's domain like a missing one", async (_name, call) => {
    signIn("TALENT", "u2");
    accounts({ u1: {}, u2: {} });

    db.siteDomain.findUnique.mockResolvedValue({
      id: "d1",
      siteId: SITE,
      hostname: "www.ana-lee.com",
      kind: "CUSTOM",
      status: "PENDING",
      verificationToken: "t".repeat(32),
      site: { userId: "u1" },
    });
    const theirs = await call();
    db.siteDomain.findUnique.mockResolvedValue(null);

    expect(theirs).toEqual({ ok: false, error: { key: "errors.notFound" } });
    expect(await call()).toEqual(theirs);
    expect(resolveTxt).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("saveSite", () => {
  beforeEach(() => signIn("TALENT"));

  function revisionWritten(): Record<string, unknown> {
    return (tx.siteRevision.create.mock.calls.at(-1) as [{ data: Record<string, unknown> }])[0].data;
  }

  it("creates a draft owned by the caller, with revision 1 in the same transaction", async () => {
    db.site.count.mockResolvedValue(0);
    tx.site.create.mockResolvedValue({ id: "s1" });

    expect(await saveSite(validSite)).toEqual({ ok: true, siteId: "s1" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const { data } = (tx.site.create.mock.calls[0] as [{ data: Record<string, string> }])[0];
    expect(data).toMatchObject({ userId: "u1", status: "DRAFT", template: "marquee" });
    expect(JSON.parse(data.content)).toEqual({
      name: "Ana Lee",
      headline: "",
      bio: "",
      links: [],
      credits: [],
      mediaIds: [],
    });
    // The revision is a copy of exactly what the site row holds.
    expect(revisionWritten()).toEqual({
      siteId: "s1",
      version: 1,
      template: "marquee",
      content: data.content,
      createdById: "u1",
    });
    // A customer's own save is not an audit event; an operator's is.
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it.each([
    ["no name", { template: "marquee", content: { name: "" } }],
    ["an unknown template", { template: "neon", content: { name: "Ana Lee" } }],
    ["a link that is not https", { template: "marquee", content: { name: "Ana Lee", links: [{ label: "x", url: "http://x.com" }] } }],
    ["a script link", { template: "marquee", content: { name: "Ana Lee", links: [{ label: "x", url: "javascript:alert(1)" }] } }],
    ["no input at all", undefined],
  ])("answers errors.siteInvalid for %s", async (_label, input) => {
    expect(await saveSite(input)).toEqual({ ok: false, error: { key: "errors.siteInvalid" } });
    expectNoWrites();
  });

  it("refuses a fourth site", async () => {
    db.site.count.mockResolvedValue(3);
    expect(await saveSite(validSite)).toEqual({
      ok: false,
      error: { key: "errors.siteLimitReached", values: { limit: 3 } },
    });
    expect(db.site.count).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expectNoWrites();
  });

  it("updates the caller's own site, with the owner in the condition, and writes the next revision", async () => {
    db.site.findUnique.mockResolvedValue(siteRow());
    tx.site.updateMany.mockResolvedValue({ count: 1 });
    tx.siteRevision.findFirst.mockResolvedValue({ version: 3 });

    expect(await saveSite({ ...validSite, siteId: SITE })).toEqual({ ok: true, siteId: SITE });

    expect(tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: SITE, userId: "u1" },
      data: { template: "marquee", content: expect.any(String) },
    });
    expect(tx.siteRevision.findFirst).toHaveBeenCalledWith({
      where: { siteId: SITE },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    expect(revisionWritten()).toMatchObject({ siteId: SITE, version: 4, template: "marquee", createdById: "u1" });
    // The site row is written before the version is read: that write is the
    // lock that keeps two saves from taking the same number.
    expect(tx.site.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.siteRevision.findFirst.mock.invocationCallOrder[0]
    );
    // The limit is on new sites, not on edits.
    expect(db.site.count).not.toHaveBeenCalled();
    expect(tx.site.create).not.toHaveBeenCalled();
  });

  it("starts at version 1 for a site saved before revisions existed", async () => {
    db.site.findUnique.mockResolvedValue(siteRow());
    tx.site.updateMany.mockResolvedValue({ count: 1 });
    tx.siteRevision.findFirst.mockResolvedValue(null);

    await saveSite({ ...validSite, siteId: SITE });

    expect(revisionWritten()).toMatchObject({ version: 1 });
  });

  it("leaves the approval and the published revision alone", async () => {
    db.site.findUnique.mockResolvedValue(
      siteRow({ status: "PUBLISHED", approvedRevisionId: "rev2", publishedRevisionId: "rev2" })
    );
    tx.site.updateMany.mockResolvedValue({ count: 1 });
    tx.siteRevision.findFirst.mockResolvedValue({ version: 2 });

    await saveSite({ ...validSite, siteId: SITE });

    const { data } = (tx.site.updateMany.mock.calls[0] as [{ data: Record<string, unknown> }])[0];
    expect(Object.keys(data).sort()).toEqual(["content", "template"]);
    expect(tx.site.update).not.toHaveBeenCalled();
  });

  it("writes no revision when the site was gone by the time of the write", async () => {
    db.site.findUnique.mockResolvedValue(siteRow());
    tx.site.updateMany.mockResolvedValue({ count: 0 });

    expect(await saveSite({ ...validSite, siteId: SITE })).toEqual({
      ok: false,
      error: { key: "errors.siteNotFound" },
    });
    expect(tx.siteRevision.create).not.toHaveBeenCalled();
  });

  it("keeps only the owner's own media, in the order given", async () => {
    db.media.findMany.mockResolvedValue([{ id: "m3" }, { id: "m1" }]);
    db.site.count.mockResolvedValue(0);
    tx.site.create.mockResolvedValue({ id: "s1" });

    await saveSite({
      template: "marquee",
      content: { name: "Ana Lee", mediaIds: ["m1", "foreign", "m3", "m1"] },
    });

    expect(db.media.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "foreign", "m3"] }, profile: { userId: "u1" } },
      select: { id: true },
    });
    const { data } = (tx.site.create.mock.calls[0] as [{ data: { content: string } }])[0];
    expect(JSON.parse(data.content).mediaIds).toEqual(["m1", "m3"]);
  });

  describe("by an operator", () => {
    beforeEach(() => signInOperator());

    it("edits a customer's site, keeps the customer's media, and audits the save", async () => {
      db.site.findUnique.mockResolvedValue(siteRow());
      db.media.findMany.mockResolvedValue([{ id: "m1" }]);
      tx.site.updateMany.mockResolvedValue({ count: 1 });
      tx.siteRevision.findFirst.mockResolvedValue({ version: 1 });

      expect(
        await saveSite({ template: "studio", siteId: SITE, content: { name: "Ana Lee", mediaIds: ["m1", "m9"] } })
      ).toEqual({ ok: true, siteId: SITE });

      // No owner in the condition: the operator is not the owner.
      expect(tx.site.updateMany).toHaveBeenCalledWith({
        where: { id: SITE },
        data: { template: "studio", content: expect.any(String) },
      });
      // Media are filtered by the SITE OWNER's profile, not the operator's.
      expect(db.media.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["m1", "m9"] }, profile: { userId: "u1" } },
        select: { id: true },
      });
      expect(revisionWritten()).toMatchObject({ version: 2, createdById: "op1" });
      expect(audits()[0]).toMatchObject({
        actorUserId: "op1",
        action: "limelight.site.operator_save",
        resourceType: "Site",
        resourceId: SITE,
      });
      expect(JSON.parse(audits()[0].after)).toEqual({ version: 2, ownerId: "u1" });
      expect(revalidatePath).toHaveBeenCalledWith("/[locale]/admin", "layout");
    });

    it("opens a new site for a customer named by ownerId", async () => {
      db.site.count.mockResolvedValue(1);
      tx.site.create.mockResolvedValue({ id: "s9" });

      expect(await saveSite({ ...validSite, ownerId: "u2" })).toEqual({ ok: true, siteId: "s9" });

      expect(db.site.count).toHaveBeenCalledWith({ where: { userId: "u2" } });
      expect((tx.site.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data).toMatchObject({
        userId: "u2",
        status: "DRAFT",
      });
      expect(revisionWritten()).toMatchObject({ siteId: "s9", version: 1, createdById: "op1" });
      expect(JSON.parse(audits()[0].after)).toEqual({ version: 1, ownerId: "u2", created: true });
    });

    it("counts the customer's sites, not the operator's, against the limit", async () => {
      db.site.count.mockResolvedValue(3);
      expect(await saveSite({ ...validSite, ownerId: "u2" })).toEqual({
        ok: false,
        error: { key: "errors.siteLimitReached", values: { limit: 3 } },
      });
      expectNoWrites();
    });

    it("answers errors.notFound for an owner that does not exist or is not a talent", async () => {
      expect(await saveSite({ ...validSite, ownerId: "ghost" })).toEqual({
        ok: false,
        error: { key: "errors.notFound" },
      });
      accounts({ op1: { isAdmin: true, kind: "CASTING" }, c1: { kind: "CASTING" } });
      expect(await saveSite({ ...validSite, ownerId: "c1" })).toEqual({
        ok: false,
        error: { key: "errors.notFound" },
      });
      expectNoWrites();
    });

    it("has no site of their own to open when they are not a talent", async () => {
      expect(await saveSite(validSite)).toEqual({ ok: false, error: { key: "errors.siteInvalid" } });
      expectNoWrites();
    });
  });

  it("refuses a talent who names another account as the owner", async () => {
    accounts({ u1: {}, u2: {} });

    expect(await saveSite({ ...validSite, ownerId: "u2" })).toEqual({
      ok: false,
      error: { key: "errors.forbidden" },
    });
    expect(db.site.count).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("treats the caller's own id as ownerId like no ownerId at all", async () => {
    db.site.count.mockResolvedValue(0);
    tx.site.create.mockResolvedValue({ id: "s1" });

    expect(await saveSite({ ...validSite, ownerId: "u1" })).toEqual({ ok: true, siteId: "s1" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("startSiteCheckout", () => {
  beforeEach(() => signIn("TALENT"));

  function ownSiteUnpaid() {
    db.site.findFirst.mockResolvedValue({ id: "s1" });
    db.siteOrder.findFirst.mockResolvedValue(null);
    db.studentPriceRequest.findUnique.mockResolvedValue(null);
  }

  describe("while payments are off (the beta)", () => {
    it.each([
      ["a valid request", { siteId: "s1", offer: "essential" }],
      ["an unknown offer", { siteId: "s1", offer: "platinum" }],
      ["no input", null],
    ])("answers errors.billingUnavailable for %s, and reads and writes nothing", async (_label, input) => {
      ownSiteUnpaid();

      expect(await startSiteCheckout(input as never)).toEqual({
        ok: false,
        error: { key: "errors.billingUnavailable" },
      });
      expect(db.site.findFirst).not.toHaveBeenCalled();
      expect(db.siteOrder.findFirst).not.toHaveBeenCalled();
      expect(tx.siteOrder.create).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("stays off even where the mock billing is allowed", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ALLOW_MOCK_BILLING", "true");
      ownSiteUnpaid();

      expect(await startSiteCheckout({ siteId: "s1", offer: "essential" })).toEqual({
        ok: false,
        error: { key: "errors.billingUnavailable" },
      });
      expectNoWrites();
    });
  });

  describe("once payments are on", () => {
    beforeEach(() => {
      flags.paymentsEnabled = true;
    });

    it("answers errors.siteNotFound for someone else's site and creates nothing", async () => {
      db.site.findFirst.mockResolvedValue(null);

      expect(await startSiteCheckout({ siteId: "theirs", offer: "essential" })).toEqual({
        ok: false,
        error: { key: "errors.siteNotFound" },
      });
      expect(db.site.findFirst).toHaveBeenCalledWith({
        where: { id: "theirs", userId: "u1" },
        select: { id: true },
      });
      expectNoWrites();
    });

    it.each([
      ["an unknown offer", { siteId: "s1", offer: "platinum" }],
      ["no site id", { offer: "essential" }],
      ["no input", null],
    ])("answers errors.invalidInput for %s", async (_label, input) => {
      expect(await startSiteCheckout(input as never)).toEqual({
        ok: false,
        error: { key: "errors.invalidInput" },
      });
      expect(db.site.findFirst).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("answers errors.billingUnavailable in production without real billing, before any order exists", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ALLOW_MOCK_BILLING", "");
      ownSiteUnpaid();

      expect(await startSiteCheckout({ siteId: "s1", offer: "essential" })).toEqual({
        ok: false,
        error: { key: "errors.billingUnavailable" },
      });
      expect(tx.siteOrder.create).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("goes through in production when the mock is allowed on purpose", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ALLOW_MOCK_BILLING", "true");
      ownSiteUnpaid();
      tx.siteOrder.create.mockResolvedValue({ id: "o1" });
      tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
      tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
      tx.subscription.upsert.mockResolvedValue({ compUntil: null });

      expect(await startSiteCheckout({ siteId: "s1", offer: "essential" })).toEqual({ ok: true });
    });

    it("creates a pending order, audits it, then fulfills it when the mock says paid", async () => {
      ownSiteUnpaid();
      tx.siteOrder.create.mockResolvedValue({ id: "o1" });
      tx.siteOrder.findUnique.mockResolvedValue(pendingOrder({ offer: "signature", amountCents: 14900 }));
      tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
      tx.subscription.upsert.mockResolvedValue({ compUntil: null });

      expect(await startSiteCheckout({ siteId: "s1", offer: "signature" })).toEqual({ ok: true });

      expect(tx.siteOrder.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          siteId: "s1",
          offer: "signature",
          amountCents: 14900,
          currency: "USD",
          studentDiscount: false,
          status: "PENDING",
          provider: "mock",
        },
        select: { id: true },
      });
      expect(audits().map((a) => a.action)).toEqual([
        "limelight.checkout.start",
        "limelight.order.paid",
      ]);
      expect(audits()[0]).toMatchObject({ actorUserId: "u1", resourceType: "SiteOrder", resourceId: "o1" });
      expect(JSON.parse(audits()[0].after)).toEqual({
        siteId: "s1",
        offer: "signature",
        amountCents: 14900,
        studentDiscount: false,
      });
      // Fulfillment: the order becomes PAID and Pro is granted.
      expect(tx.siteOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "o1", status: "PENDING" } })
      );
      expect(tx.subscription.update).toHaveBeenCalledWith({
        where: { subjectId: "u1" },
        data: { compPlan: "PRO", compUntil: expect.any(Date) },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
    });

    it("charges an approved student the round 8 student price", async () => {
      ownSiteUnpaid();
      db.studentPriceRequest.findUnique.mockResolvedValue({ status: "APPROVED" });
      tx.siteOrder.create.mockResolvedValue({ id: "o1" });
      tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
      tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
      tx.subscription.upsert.mockResolvedValue({ compUntil: null });

      await startSiteCheckout({ siteId: "s1", offer: "essential" });

      expect(tx.siteOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountCents: 2900, studentDiscount: true }),
        })
      );
    });

    it("does not sell a site that is already paid for a second time", async () => {
      db.site.findFirst.mockResolvedValue({ id: "s1" });
      db.siteOrder.findFirst.mockResolvedValue({ id: "o0" });

      expect(await startSiteCheckout({ siteId: "s1", offer: "essential" })).toEqual({
        ok: true,
        alreadyPaid: true,
      });
      expect(db.siteOrder.findFirst).toHaveBeenCalledWith({
        where: { siteId: "s1", status: "PAID" },
        select: { id: true },
      });
      expectNoWrites();
    });
  });
});

describe("approveSitePreview", () => {
  const latest = { id: "rev4", version: 4, content: JSON.stringify({ name: "Ana Lee" }) };

  function ownSite(over: Record<string, unknown> = {}) {
    signIn("TALENT");
    db.site.findUnique.mockResolvedValue(siteRow(over));
    tx.site.updateMany.mockResolvedValue({ count: 1 });
    tx.siteRevision.findFirst.mockResolvedValue(latest);
  }

  it("lets the customer approve the latest revision, with who and when", async () => {
    ownSite({ approvedRevisionId: "rev2" });

    expect(await approveSitePreview(SITE)).toEqual({ ok: true, revisionId: "rev4", version: 4 });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: SITE, userId: "u1" },
      data: { approvedAt: expect.any(Date), approvedById: "u1" },
    });
    expect(tx.siteRevision.findFirst).toHaveBeenCalledWith({
      where: { siteId: SITE },
      orderBy: { version: "desc" },
      select: { id: true, version: true, content: true },
    });
    expect(tx.site.update).toHaveBeenCalledWith({
      where: { id: SITE },
      data: { approvedRevisionId: "rev4" },
    });
    // The site row is locked before "latest" is read.
    expect(tx.site.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.siteRevision.findFirst.mock.invocationCallOrder[0]
    );
    expect(audits()[0]).toMatchObject({
      actorUserId: "u1",
      action: "limelight.site.approve",
      resourceType: "Site",
      resourceId: SITE,
    });
    expect(JSON.parse(audits()[0].before)).toEqual({ approvedRevisionId: "rev2" });
    expect(JSON.parse(audits()[0].after)).toMatchObject({ approvedRevisionId: "rev4", version: 4 });
  });

  it("does not publish anything: approving and going online are two steps", async () => {
    ownSite();
    await approveSitePreview(SITE);

    for (const call of [...tx.site.updateMany.mock.calls, ...tx.site.update.mock.calls]) {
      const { data } = (call as [{ data: Record<string, unknown> }])[0];
      expect(data).not.toHaveProperty("status");
      expect(data).not.toHaveProperty("publishedRevisionId");
    }
  });

  it("refuses an operator: only the customer approves", async () => {
    signInOperator();
    db.site.findUnique.mockResolvedValue(siteRow());

    expect(await approveSitePreview(SITE)).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expectNoWrites();
  });

  it("lets an admin approve a site that is their own", async () => {
    signIn("TALENT", "u1");
    accounts({ u1: { isAdmin: true } });
    db.site.findUnique.mockResolvedValue(siteRow());
    tx.site.updateMany.mockResolvedValue({ count: 1 });
    tx.siteRevision.findFirst.mockResolvedValue(latest);

    expect(await approveSitePreview(SITE)).toMatchObject({ ok: true, version: 4 });
  });

  it("turns the draft of a site saved before revisions existed into version 1, then approves it", async () => {
    ownSite({ template: "studio", content: JSON.stringify({ name: "Legacy Site" }) });
    tx.siteRevision.findFirst.mockResolvedValue(null);
    tx.siteRevision.create.mockResolvedValue({
      id: "rev1",
      version: 1,
      content: JSON.stringify({ name: "Legacy Site" }),
    });

    expect(await approveSitePreview(SITE)).toEqual({ ok: true, revisionId: "rev1", version: 1 });
    expect(tx.siteRevision.create).toHaveBeenCalledWith({
      data: {
        siteId: SITE,
        version: 1,
        template: "studio",
        content: JSON.stringify({ name: "Legacy Site" }),
        createdById: "u1",
      },
      select: { id: true, version: true, content: true },
    });
  });

  it("refuses to approve a preview that changed since the page was shown", async () => {
    ownSite();

    expect(await approveSitePreview(SITE, 3)).toEqual({ ok: false, error: { key: "errors.sitePreviewChanged" } });
    expect(tx.site.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();

    expect(await approveSitePreview(SITE, 4)).toEqual({ ok: true, revisionId: "rev4", version: 4 });
  });

  it.each([0, -1, 1.5, "4", Number.NaN])("answers errors.invalidInput for the expected version %j", async (version) => {
    ownSite();
    expect(await approveSitePreview(SITE, version as never)).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expectNoWrites();
  });

  it("answers errors.siteInvalid when the latest revision no longer parses", async () => {
    ownSite();
    tx.siteRevision.findFirst.mockResolvedValue({ id: "rev4", version: 4, content: "{}" });

    expect(await approveSitePreview(SITE)).toEqual({ ok: false, error: { key: "errors.siteInvalid" } });
    expect(tx.site.update).not.toHaveBeenCalled();
  });

  it("answers errors.siteNotFound when the site changed hands before the write", async () => {
    ownSite();
    tx.site.updateMany.mockResolvedValue({ count: 0 });

    expect(await approveSitePreview(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotFound" } });
    expect(tx.site.update).not.toHaveBeenCalled();
  });
});

describe("publishSite", () => {
  beforeEach(() => signIn("TALENT"));

  const approvedContent = JSON.stringify({ name: "Chloé Müller" });

  /** An approved site: revision rev2 is approved, the draft has moved on. */
  function approved(over: Record<string, unknown> = {}, revision: Record<string, unknown> | null = {}) {
    db.site.findUnique.mockResolvedValue(siteRow({ approvedRevisionId: "rev2", ...over }));
    db.siteRevision.findFirst.mockResolvedValue(
      revision === null ? null : { id: "rev2", version: 2, content: approvedContent, ...revision }
    );
    db.site.findMany.mockResolvedValue([]);
    tx.site.updateMany.mockResolvedValue({ count: 1 });
  }

  function published(): Record<string, unknown> {
    return (tx.site.updateMany.mock.calls.at(-1) as [{ data: Record<string, unknown> }])[0].data;
  }

  describe("the gate: an approved revision", () => {
    it("answers errors.siteNotApproved for a site nobody approved, and writes nothing", async () => {
      db.site.findUnique.mockResolvedValue(siteRow());

      expect(await publishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
      expect(db.siteRevision.findFirst).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("needs no order while payments are off", async () => {
      approved();

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });
      expect(db.siteOrder.findFirst).not.toHaveBeenCalled();
    });

    it("answers errors.siteNotApproved when the approved revision is not one of this site's", async () => {
      approved({}, null);

      expect(await publishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
      // The site id is part of the lookup: an approval can never point at
      // another site's revision.
      expect(db.siteRevision.findFirst).toHaveBeenCalledWith({
        where: { id: "rev2", siteId: SITE },
        select: { id: true, version: true, content: true },
      });
      expectNoWrites();
    });

    it("answers errors.siteNotApproved when the approval moved between the read and the write", async () => {
      approved();
      tx.site.updateMany.mockResolvedValue({ count: 0 });

      expect(await publishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      // One try, not one per candidate name.
      expect(tx.site.updateMany).toHaveBeenCalledTimes(1);
    });

    it("answers errors.siteInvalid when the approved revision no longer parses", async () => {
      approved({}, { content: "{}" });

      expect(await publishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteInvalid" } });
      expectNoWrites();
    });
  });

  it("publishes THE APPROVED revision, never the working draft, with an audit entry", async () => {
    // The draft on the site row says "Working Draft"; revision 2 says
    // "Chloé Müller". What goes online, and the address, come from rev2.
    approved();

    expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: SITE, userId: "u1", approvedRevisionId: "rev2" },
      data: {
        status: "PUBLISHED",
        publishedAt: expect.any(Date),
        subdomain: "chloe-muller",
        publishedRevisionId: "rev2",
      },
    });
    expect(audits()[0]).toMatchObject({
      actorUserId: "u1",
      action: "limelight.site.publish",
      resourceType: "Site",
      resourceId: SITE,
    });
    expect(JSON.parse(audits()[0].after)).toMatchObject({
      status: "PUBLISHED",
      subdomain: "chloe-muller",
      publishedRevisionId: "rev2",
      version: 2,
      by: "customer",
    });
  });

  it("lets an operator publish what the customer approved", async () => {
    signInOperator();
    approved();

    expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });
    expect(tx.site.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SITE, approvedRevisionId: "rev2" } })
    );
    expect(JSON.parse(audits()[0].after)).toMatchObject({ by: "operator" });
    expect(audits()[0].actorUserId).toBe("op1");
  });

  it("does not let an operator publish a site the customer has not approved", async () => {
    signInOperator();
    db.site.findUnique.mockResolvedValue(siteRow());

    expect(await publishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
    expectNoWrites();
  });

  describe("the hostname", () => {
    it("records <subdomain>.<root domain> as an ACTIVE domain when the root domain is set", async () => {
      vi.stubEnv("LIMELIGHT_ROOT_DOMAIN", "agental.site");
      approved();

      await publishSite(SITE);

      expect(tx.siteDomain.upsert).toHaveBeenCalledWith({
        where: { hostname: "chloe-muller.agental.site" },
        create: {
          siteId: SITE,
          hostname: "chloe-muller.agental.site",
          kind: "SUBDOMAIN",
          status: "ACTIVE",
          verificationToken: "",
          verifiedAt: expect.any(Date),
        },
        update: { siteId: SITE, kind: "SUBDOMAIN", status: "ACTIVE" },
      });
      expect(JSON.parse(audits()[0].after)).toMatchObject({ hostname: "chloe-muller.agental.site" });
    });

    it("records no domain while the root domain is unset", async () => {
      approved();

      await publishSite(SITE);

      expect(tx.siteDomain.upsert).not.toHaveBeenCalled();
      expect(JSON.parse(audits()[0].after)).toMatchObject({ hostname: null });
    });

    it("numbers the subdomain when the name is taken", async () => {
      approved();
      db.site.findMany.mockResolvedValue([{ subdomain: "chloe-muller" }, { subdomain: "chloe-muller-2" }]);

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller-3" });
      expect(tx.site.updateMany).toHaveBeenCalledTimes(1);
    });

    it("moves to the next name when another site takes one between the lookup and the write", async () => {
      approved();
      // The unique index on Site.subdomain refuses the first write.
      tx.site.updateMany.mockRejectedValueOnce({ code: "P2002" });

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller-2" });
      expect(tx.site.updateMany).toHaveBeenCalledTimes(2);
      // The refused attempt wrote no audit entry.
      expect(audits()).toHaveLength(1);
    });

    it("rethrows a database error that is not a name collision", async () => {
      approved();
      tx.site.updateMany.mockRejectedValue(new Error("connection reset"));

      await expect(publishSite(SITE)).rejects.toThrow("connection reset");
      expect(tx.site.updateMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["a name in a non-Latin script", "李娜"],
      ["a reserved word", "Admin"],
      ["a two-letter name", "Al"],
    ])("falls back to the site id for %s", async (_label, name) => {
      approved({}, { content: JSON.stringify({ name }) });

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "site-cmwsite0" });
    });

    it("gives a site that was published before the subdomain it had", async () => {
      approved({ subdomain: "chloe" }, { content: JSON.stringify({ name: "Chloé Müller-Dupont" }) });

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe" });
      expect(db.site.findMany).not.toHaveBeenCalled();
      expect(published()).toMatchObject({ status: "PUBLISHED", subdomain: "chloe", publishedRevisionId: "rev2" });
    });
  });

  describe("a site that is already online", () => {
    it("changes nothing when the approved revision is the one online", async () => {
      approved({ status: "PUBLISHED", subdomain: "chloe-muller", publishedRevisionId: "rev2" });

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });
      expectNoWrites();
    });

    it("still records the hostname if the root domain was configured after the first publication", async () => {
      vi.stubEnv("LIMELIGHT_ROOT_DOMAIN", "agental.site");
      approved({ status: "PUBLISHED", subdomain: "chloe-muller", publishedRevisionId: "rev2" });

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });
      expect(db.siteDomain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hostname: "chloe-muller.agental.site" } })
      );
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("puts a newly approved revision online at the same address", async () => {
      // rev2 is online; the customer has since approved rev5.
      approved(
        { status: "PUBLISHED", subdomain: "chloe-muller", publishedRevisionId: "rev2", approvedRevisionId: "rev5" },
        { id: "rev5", version: 5 }
      );

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });
      expect(published()).toMatchObject({ subdomain: "chloe-muller", publishedRevisionId: "rev5" });
      expect(JSON.parse(audits()[0].before)).toMatchObject({ publishedRevisionId: "rev2" });
    });
  });

  describe("once payments are on", () => {
    beforeEach(() => {
      flags.paymentsEnabled = true;
    });

    it("answers errors.sitePaymentRequired without a paid order", async () => {
      approved();
      db.siteOrder.findFirst.mockResolvedValue(null);

      expect(await publishSite(SITE)).toEqual({
        ok: false,
        error: { key: "errors.sitePaymentRequired" },
      });
      // Only a PAID order counts: not a pending, canceled or refunded one.
      expect(db.siteOrder.findFirst).toHaveBeenCalledWith({
        where: { siteId: SITE, status: "PAID" },
        select: { id: true },
      });
      expectNoWrites();
    });

    it("still needs the approval when the site is paid", async () => {
      db.site.findUnique.mockResolvedValue(siteRow());
      db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });

      expect(await publishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotApproved" } });
      expectNoWrites();
    });

    it("publishes a paid, approved site", async () => {
      approved();
      db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });

      expect(await publishSite(SITE)).toEqual({ ok: true, subdomain: "chloe-muller" });
    });
  });
});

describe("unpublishSite", () => {
  it("takes the caller's site offline and keeps its subdomain and its approval", async () => {
    signIn("TALENT");
    db.site.findUnique.mockResolvedValue(
      siteRow({ status: "PUBLISHED", subdomain: "ana-lee", approvedRevisionId: "rev2", publishedRevisionId: "rev2" })
    );
    tx.site.updateMany.mockResolvedValue({ count: 1 });

    expect(await unpublishSite(SITE)).toEqual({ ok: true });
    // The status and the published revision, and nothing else: the address
    // and the approval stay where they are.
    expect(tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: SITE, userId: "u1" },
      data: { status: "DRAFT", publishedRevisionId: null },
    });
    expect(audits()[0]).toMatchObject({ action: "limelight.site.unpublish", resourceId: SITE, actorUserId: "u1" });
    expect(JSON.parse(audits()[0].before)).toEqual({ status: "PUBLISHED", publishedRevisionId: "rev2" });
  });

  it("lets an operator take a customer's site offline", async () => {
    signInOperator();
    db.site.findUnique.mockResolvedValue(siteRow({ status: "PUBLISHED", publishedRevisionId: "rev2" }));
    tx.site.updateMany.mockResolvedValue({ count: 1 });

    expect(await unpublishSite(SITE)).toEqual({ ok: true });
    expect(tx.site.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: SITE } }));
    expect(JSON.parse(audits()[0].after)).toMatchObject({ by: "operator" });
  });

  it("answers errors.siteNotFound, with no audit entry, when nothing was changed", async () => {
    signIn("TALENT");
    db.site.findUnique.mockResolvedValue(siteRow());
    tx.site.updateMany.mockResolvedValue({ count: 0 });

    expect(await unpublishSite(SITE)).toEqual({ ok: false, error: { key: "errors.siteNotFound" } });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("setSiteContactVisibility", () => {
  it.each([true, false])("lets the owner set showContact to %j, audited", async (show) => {
    signIn("TALENT");
    db.site.findUnique.mockResolvedValue(siteRow());
    tx.site.updateMany.mockResolvedValue({ count: 1 });

    expect(await setSiteContactVisibility(SITE, show)).toEqual({ ok: true, showContact: show });
    expect(tx.site.updateMany).toHaveBeenCalledWith({
      where: { id: SITE, userId: "u1" },
      data: { showContact: show },
    });
    expect(audits()[0]).toMatchObject({ action: "limelight.site.contact_visibility", resourceId: SITE });
    expect(JSON.parse(audits()[0].after)).toEqual({ showContact: show });
  });

  it("refuses an operator: showing contact details is the customer's choice", async () => {
    signInOperator();
    db.site.findUnique.mockResolvedValue(siteRow());

    expect(await setSiteContactVisibility(SITE, true)).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expectNoWrites();
  });

  it.each(["true", 1, null, undefined])("answers errors.invalidInput for %j", async (show) => {
    signIn("TALENT");
    expect(await setSiteContactVisibility(SITE, show as never)).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expect(db.site.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("custom domains", () => {
  const token = "0123456789abcdef0123456789abcdef";
  const domainRow = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    siteId: SITE,
    hostname: "www.ana-lee.com",
    kind: "CUSTOM",
    status: "PENDING",
    verificationToken: token,
    site: { userId: "u1" },
    ...over,
  });

  describe("addSiteDomain", () => {
    beforeEach(() => {
      signIn("TALENT");
      db.site.findUnique.mockResolvedValue(siteRow());
      db.siteDomain.findUnique.mockResolvedValue(null);
      db.siteDomain.count.mockResolvedValue(0);
      tx.siteDomain.create.mockResolvedValue({ id: "d1" });
    });

    it("creates a pending domain with a fresh token and answers the DNS records", async () => {
      vi.stubEnv("LIMELIGHT_ROOT_DOMAIN", "agental.site");

      const result = await addSiteDomain(SITE, "  WWW.Ana-Lee.com. ");

      const { data } = (tx.siteDomain.create.mock.calls[0] as [{ data: Record<string, string> }])[0];
      expect(data).toEqual({
        siteId: SITE,
        hostname: "www.ana-lee.com",
        kind: "CUSTOM",
        status: "PENDING",
        verificationToken: expect.stringMatching(/^[0-9a-f]{32}$/),
      });
      expect(result).toEqual({
        ok: true,
        domainId: "d1",
        hostname: "www.ana-lee.com",
        dns: {
          txtName: "_agental-verify.www.ana-lee.com",
          txtValue: `agental-site-verification=${data.verificationToken}`,
          cnameTarget: "agental.site",
        },
      });
      expect(audits()[0]).toMatchObject({ action: "limelight.domain.add", resourceType: "SiteDomain", resourceId: "d1" });
      // The token proves control of the domain: it stays out of the audit log.
      expect(audits()[0].after).not.toContain(data.verificationToken);
    });

    it.each([
      "not a domain",
      "localhost",
      "https://www.ana-lee.com",
      "ana.agental.co",
      "ana-lee.agental.site",
      "www.example.com",
      "203.0.113.7",
      "",
    ])("answers errors.domainInvalid for %j", async (hostname) => {
      vi.stubEnv("LIMELIGHT_ROOT_DOMAIN", "agental.site");

      expect(await addSiteDomain(SITE, hostname)).toEqual({ ok: false, error: { key: "errors.domainInvalid" } });
      expect(db.siteDomain.findUnique).not.toHaveBeenCalled();
      expectNoWrites();
    });

    it("answers errors.domainTaken for a hostname held by another site, whatever its status", async () => {
      for (const status of ["PENDING", "VERIFIED", "ACTIVE"]) {
        db.siteDomain.findUnique.mockResolvedValue({
          id: "d9",
          siteId: "another-site",
          kind: "CUSTOM",
          status,
          verificationToken: "their-token",
        });
        const result = await addSiteDomain(SITE, "www.ana-lee.com");

        expect(result).toEqual({ ok: false, error: { key: "errors.domainTaken" } });
        // The other site's token is never shown.
        expect(JSON.stringify(result)).not.toContain("their-token");
      }
      expectNoWrites();
    });

    it("answers the same records again for a domain already on this site", async () => {
      db.siteDomain.findUnique.mockResolvedValue({ id: "d1", siteId: SITE, kind: "CUSTOM", verificationToken: token });

      expect(await addSiteDomain(SITE, "www.ana-lee.com")).toMatchObject({
        ok: true,
        domainId: "d1",
        dns: { txtValue: `agental-site-verification=${token}` },
      });
      expectNoWrites();
    });

    it("answers errors.domainTaken when the same hostname is added in the same instant", async () => {
      tx.siteDomain.create.mockRejectedValue({ code: "P2002" });

      expect(await addSiteDomain(SITE, "www.ana-lee.com")).toEqual({
        ok: false,
        error: { key: "errors.domainTaken" },
      });
    });

    it("stops at five custom domains per site", async () => {
      db.siteDomain.count.mockResolvedValue(5);

      expect(await addSiteDomain(SITE, "www.ana-lee.com")).toEqual({
        ok: false,
        error: { key: "errors.domainLimitReached", values: { limit: 5 } },
      });
      expect(db.siteDomain.count).toHaveBeenCalledWith({ where: { siteId: SITE, kind: "CUSTOM" } });
      expectNoWrites();
    });

    it("lets an operator add a domain to a customer's site", async () => {
      signInOperator();

      expect(await addSiteDomain(SITE, "www.ana-lee.com")).toMatchObject({ ok: true, hostname: "www.ana-lee.com" });
      expect(JSON.parse(audits()[0].after)).toMatchObject({ by: "operator" });
    });
  });

  describe("verifySiteDomain", () => {
    beforeEach(() => {
      signIn("TALENT");
      db.siteDomain.updateMany.mockResolvedValue({ count: 1 });
    });

    it("marks the domain VERIFIED when the TXT record is there", async () => {
      db.siteDomain.findUnique.mockResolvedValue(domainRow());
      resolveTxt.mockResolvedValue([["v=spf1 -all"], [`agental-site-verification=${token}`]]);

      expect(await verifySiteDomain("d1")).toEqual({
        ok: true,
        domainId: "d1",
        hostname: "www.ana-lee.com",
        status: "VERIFIED",
      });
      expect(resolveTxt).toHaveBeenCalledWith("_agental-verify.www.ana-lee.com");
      expect(db.siteDomain.updateMany).toHaveBeenCalledWith({
        where: { id: "d1", status: { in: ["PENDING", "FAILED"] } },
        data: { status: "VERIFIED", verifiedAt: expect.any(Date), lastCheckedAt: expect.any(Date) },
      });
      expect(audits(db)[0]).toMatchObject({ action: "limelight.domain.verify", resourceId: "d1" });
    });

    it("never makes the domain ACTIVE: that is the operator's step", async () => {
      db.siteDomain.findUnique.mockResolvedValue(domainRow());
      resolveTxt.mockResolvedValue([[`agental-site-verification=${token}`]]);

      await verifySiteDomain("d1");

      expect(JSON.stringify(db.siteDomain.updateMany.mock.calls)).not.toContain("ACTIVE");
    });

    it.each([
      ["no record", []],
      ["another site's token", [["agental-site-verification=ffffffffffffffffffffffffffffffff"]]],
    ])("answers errors.domainNotVerified for %s, and records the time of the look", async (_label, records) => {
      db.siteDomain.findUnique.mockResolvedValue(domainRow());
      resolveTxt.mockResolvedValue(records);

      expect(await verifySiteDomain("d1")).toEqual({ ok: false, error: { key: "errors.domainNotVerified" } });
      expect(db.siteDomain.updateMany).toHaveBeenCalledWith({
        where: { id: "d1" },
        data: { lastCheckedAt: expect.any(Date) },
      });
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it("answers errors.domainNotVerified when the DNS lookup fails", async () => {
      db.siteDomain.findUnique.mockResolvedValue(domainRow());
      resolveTxt.mockRejectedValue(Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" }));

      expect(await verifySiteDomain("d1")).toEqual({ ok: false, error: { key: "errors.domainNotVerified" } });
    });

    it("answers a verified domain as it stands, without a lookup or an audit entry", async () => {
      db.siteDomain.findUnique.mockResolvedValue(domainRow({ status: "ACTIVE" }));

      expect(await verifySiteDomain("d1")).toMatchObject({ ok: true, status: "ACTIVE" });
      expect(resolveTxt).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  describe("activateSiteDomain", () => {
    it("lets an operator mark a verified domain ACTIVE, audited", async () => {
      signInAdmin(true);
      db.siteDomain.findUnique.mockResolvedValue({ id: "d1", siteId: SITE, hostname: "www.ana-lee.com", status: "VERIFIED" });
      tx.siteDomain.updateMany.mockResolvedValue({ count: 1 });

      expect(await activateSiteDomain("d1")).toEqual({
        ok: true,
        domainId: "d1",
        hostname: "www.ana-lee.com",
        status: "ACTIVE",
      });
      expect(tx.siteDomain.updateMany).toHaveBeenCalledWith({
        where: { id: "d1", status: "VERIFIED" },
        data: { status: "ACTIVE" },
      });
      expect(audits()[0]).toMatchObject({ actorUserId: "admin1", action: "limelight.domain.activate" });
    });

    it.each(["PENDING", "FAILED"])("refuses a %s domain: it was never proven", async (status) => {
      signInAdmin(true);
      db.siteDomain.findUnique.mockResolvedValue({ id: "d1", siteId: SITE, hostname: "www.ana-lee.com", status });

      expect(await activateSiteDomain("d1")).toEqual({ ok: false, error: { key: "errors.domainNotVerified" } });
      expectNoWrites();
    });

    it("answers an active domain as it stands, and a missing one as errors.notFound", async () => {
      signInAdmin(true);
      db.siteDomain.findUnique.mockResolvedValue({ id: "d1", siteId: SITE, hostname: "www.ana-lee.com", status: "ACTIVE" });
      expect(await activateSiteDomain("d1")).toMatchObject({ ok: true, status: "ACTIVE" });

      db.siteDomain.findUnique.mockResolvedValue(null);
      expect(await activateSiteDomain("d1")).toEqual({ ok: false, error: { key: "errors.notFound" } });
      expectNoWrites();
    });

    it("refuses the customer, even for their own verified domain", async () => {
      signIn("TALENT");
      accounts({ u1: {} });

      expect(await activateSiteDomain("d1")).toEqual({ ok: false, error: { key: "errors.forbidden" } });
      expect(db.siteDomain.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("removeSiteDomain", () => {
    it("lets the owner disconnect a custom domain, audited", async () => {
      signIn("TALENT");
      db.siteDomain.findUnique.mockResolvedValue(domainRow({ status: "ACTIVE" }));
      tx.siteDomain.deleteMany.mockResolvedValue({ count: 1 });

      expect(await removeSiteDomain("d1")).toEqual({ ok: true });
      expect(tx.siteDomain.deleteMany).toHaveBeenCalledWith({
        where: { id: "d1", siteId: SITE, kind: "CUSTOM" },
      });
      expect(audits()[0]).toMatchObject({ action: "limelight.domain.remove", resourceId: "d1" });
      expect(JSON.parse(audits()[0].before)).toEqual({ siteId: SITE, hostname: "www.ana-lee.com", status: "ACTIVE" });
    });

    it("does not remove the hosted subdomain this way", async () => {
      signIn("TALENT");
      db.siteDomain.findUnique.mockResolvedValue(
        domainRow({ kind: "SUBDOMAIN", hostname: "ana-lee.agental.site", status: "ACTIVE" })
      );

      expect(await removeSiteDomain("d1")).toEqual({ ok: false, error: { key: "errors.forbidden" } });
      expectNoWrites();
    });

    it("lets an operator disconnect a customer's domain", async () => {
      signInOperator();
      db.siteDomain.findUnique.mockResolvedValue(domainRow());
      tx.siteDomain.deleteMany.mockResolvedValue({ count: 1 });

      expect(await removeSiteDomain("d1")).toEqual({ ok: true });
      expect(audits()[0].actorUserId).toBe("op1");
    });
  });
});

describe("requestStudentPrice", () => {
  it("creates a pending request, or answers with the one that exists", async () => {
    signIn("TALENT");
    db.studentPriceRequest.upsert.mockResolvedValueOnce({ status: "PENDING" });
    expect(await requestStudentPrice()).toEqual({ ok: true, status: "PENDING" });
    expect(db.studentPriceRequest.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", status: "PENDING" },
      // Asking again must not reset a decision.
      update: {},
      select: { status: true },
    });

    db.studentPriceRequest.upsert.mockResolvedValueOnce({ status: "REJECTED" });
    expect(await requestStudentPrice()).toEqual({ ok: true, status: "REJECTED" });
  });
});

describe("decideStudentPrice", () => {
  it.each([
    ["approve", "APPROVED"],
    ["reject", "REJECTED"],
  ] as const)("lets an admin %s a request, with who and when", async (decision, status) => {
    signInAdmin(true);
    db.studentPriceRequest.findUnique.mockResolvedValue({ id: "r1", userId: "u1", status: "PENDING" });
    tx.studentPriceRequest.updateMany.mockResolvedValue({ count: 1 });

    expect(await decideStudentPrice("r1", decision)).toEqual({ ok: true, status });

    expect(tx.studentPriceRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: { not: "USED" } },
      data: { status, decidedBy: "admin1", decidedAt: expect.any(Date) },
    });
    expect(audits()[0]).toMatchObject({
      actorUserId: "admin1",
      action: "limelight.student.decide",
      resourceType: "StudentPriceRequest",
      resourceId: "r1",
    });
    expect(JSON.parse(audits()[0].before)).toEqual({ status: "PENDING" });
    expect(JSON.parse(audits()[0].after)).toEqual({ status, userId: "u1" });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/admin", "layout");
  });

  it("answers errors.notFound for a request that does not exist", async () => {
    signInAdmin(true);
    db.studentPriceRequest.findUnique.mockResolvedValue(null);

    expect(await decideStudentPrice("nope", "approve")).toEqual({
      ok: false,
      error: { key: "errors.notFound" },
    });
    expectNoWrites();
  });

  it("answers errors.invalidInput for a decision it does not know", async () => {
    signInAdmin(true);
    expect(await decideStudentPrice("r1", "maybe" as never)).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expectNoWrites();
  });

  it("leaves a request that already paid for an order as it is", async () => {
    signInAdmin(true);
    db.studentPriceRequest.findUnique.mockResolvedValue({ id: "r1", userId: "u1", status: "USED" });

    expect(await decideStudentPrice("r1", "approve")).toEqual({ ok: true, status: "USED" });
    expectNoWrites();
  });
});

describe("approveStudentPriceByEmail", () => {
  const ana = { id: "u7", email: "ana@example.com" };

  it("approves the account behind the email, creating the request if needed", async () => {
    signInAdmin(true);
    db.user.findMany.mockResolvedValue([ana]);
    tx.studentPriceRequest.findUnique.mockResolvedValue(null);
    tx.studentPriceRequest.upsert.mockResolvedValue({ id: "r9", status: "APPROVED" });

    expect(await approveStudentPriceByEmail("  Ana@Example.com ")).toEqual({
      ok: true,
      status: "APPROVED",
    });

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ana@example.com", mode: "insensitive" } },
      })
    );
    const decision = { status: "APPROVED", decidedBy: "admin1", decidedAt: expect.any(Date) };
    expect(tx.studentPriceRequest.upsert).toHaveBeenCalledWith({
      where: { userId: "u7" },
      create: { userId: "u7", ...decision },
      update: decision,
      select: { id: true, status: true },
    });
    expect(audits()[0]).toMatchObject({
      actorUserId: "admin1",
      action: "limelight.student.decide",
      resourceId: "r9",
    });
    expect(JSON.parse(audits()[0].after)).toEqual({ status: "APPROVED", userId: "u7", via: "email" });
  });

  it("answers errors.notFound when no account has that email", async () => {
    signInAdmin(true);
    db.user.findMany.mockResolvedValue([]);

    expect(await approveStudentPriceByEmail("nobody@example.com")).toEqual({
      ok: false,
      error: { key: "errors.notFound" },
    });
    expectNoWrites();
  });

  it("answers errors.invalidInput for something that is not an email", async () => {
    signInAdmin(true);
    expect(await approveStudentPriceByEmail("ana at example")).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("does not hand a second discount to a student who already used theirs", async () => {
    signInAdmin(true);
    db.user.findMany.mockResolvedValue([ana]);
    tx.studentPriceRequest.findUnique.mockResolvedValue({ status: "USED" });

    expect(await approveStudentPriceByEmail("ana@example.com")).toEqual({ ok: true, status: "USED" });
    expect(tx.studentPriceRequest.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Limelight sites with a mocked Prisma: the price of an offer, what a paid
 * order grants, and who may call each action.
 *
 * What is under test is the decision and the shape of the writes: an order is
 * fulfilled once, in one transaction, with its audit entry; a site that is
 * not the caller's reads as missing; nothing is created where payments are
 * off. That the conditional writes hold under real concurrency is Postgres's
 * part and was checked against a database, not here.
 */

const tx = {
  site: { update: vi.fn() },
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
  site: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  siteOrder: { findFirst: vi.fn() },
  studentPriceRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const auth = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { fulfillSiteOrder, priceForOffer } = await import("@/lib/sites");
const {
  approveStudentPriceByEmail,
  decideStudentPrice,
  publishSite,
  requestStudentPrice,
  saveSite,
  startSiteCheckout,
  unpublishSite,
} = await import("@/app/actions/sites");

const now = new Date("2026-11-19T10:00:00Z");
const validSite = { template: "marquee", content: { name: "Ana Lee" } };

function signIn(kind: "TALENT" | "CASTING", id = "u1") {
  auth.mockResolvedValue({ user: { id, kind } });
}

function signInAdmin(isAdmin: boolean) {
  signIn("CASTING", "admin1");
  db.user.findUnique.mockResolvedValue({ isAdmin });
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
  expect(db.site.create).not.toHaveBeenCalled();
  expect(db.site.updateMany).not.toHaveBeenCalled();
  expect(db.studentPriceRequest.upsert).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  // Back to the implementations given to vi.fn above, queued values dropped.
  vi.resetAllMocks();
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
      amountCents: 19900,
      studentDiscount: false,
    });
  });

  it("charges an approved student the regular price while no student price is set", () => {
    // The state of src/domain/limelight.ts today: studentPriceUsd is null.
    expect(priceForOffer("essential", { studentApproved: true })).toEqual({
      amountCents: 9900,
      studentDiscount: false,
    });
  });

  it("gives the student price on Essential to an approved student", () => {
    expect(priceForOffer("essential", { studentApproved: true }, withStudentPrice)).toEqual({
      amountCents: 5900,
      studentDiscount: true,
    });
  });

  it("never gives it without approval, nor on Signature", () => {
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
  const talentActions: Array<[string, () => Promise<{ ok: boolean; error?: unknown }>]> = [
    ["saveSite", () => saveSite(validSite)],
    ["startSiteCheckout", () => startSiteCheckout({ siteId: "s1", offer: "essential" })],
    ["publishSite", () => publishSite("s1")],
    ["unpublishSite", () => unpublishSite("s1")],
    ["requestStudentPrice", () => requestStudentPrice()],
  ];
  const adminActions: Array<[string, () => Promise<{ ok: boolean; error?: unknown }>]> = [
    ["decideStudentPrice", () => decideStudentPrice("r1", "approve")],
    ["approveStudentPriceByEmail", () => approveStudentPriceByEmail("ana@example.com")],
  ];

  it.each([...talentActions, ...adminActions])("%s refuses a visitor who is not signed in", async (_name, call) => {
    auth.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
    expectNoWrites();
    expect(db.site.findFirst).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(talentActions)("%s refuses a casting account", async (_name, call) => {
    signIn("CASTING");
    expect(await call()).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
    expectNoWrites();
    expect(db.site.findFirst).not.toHaveBeenCalled();
  });

  it.each(adminActions)("%s refuses a signed-in user who is not an admin", async (_name, call) => {
    signIn("TALENT");
    db.user.findUnique.mockResolvedValue({ isAdmin: false });
    expect(await call()).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { isAdmin: true },
    });
    expectNoWrites();
    expect(db.studentPriceRequest.findUnique).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it.each(adminActions)("%s refuses a session whose user row is gone", async (_name, call) => {
    signIn("TALENT");
    db.user.findUnique.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expectNoWrites();
  });
});

describe("saveSite", () => {
  beforeEach(() => signIn("TALENT"));

  it("creates a draft owned by the caller", async () => {
    db.site.count.mockResolvedValue(0);
    db.site.create.mockResolvedValue({ id: "s1" });

    expect(await saveSite(validSite)).toEqual({ ok: true, siteId: "s1" });

    const { data } = (db.site.create.mock.calls[0] as [{ data: Record<string, string> }])[0];
    expect(data).toMatchObject({ userId: "u1", status: "DRAFT", template: "marquee" });
    expect(JSON.parse(data.content)).toEqual({
      name: "Ana Lee",
      headline: "",
      bio: "",
      links: [],
      credits: [],
      mediaIds: [],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it.each([
    ["no name", { template: "marquee", content: { name: "" } }],
    ["an unknown template", { template: "neon", content: { name: "Ana Lee" } }],
    ["a link that is not https", { template: "marquee", content: { name: "Ana Lee", links: [{ label: "x", url: "http://x.com" }] } }],
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
    expect(db.site.create).not.toHaveBeenCalled();
  });

  it("updates the caller's own site, with the owner in the condition", async () => {
    db.site.updateMany.mockResolvedValue({ count: 1 });

    expect(await saveSite({ ...validSite, siteId: "s1" })).toEqual({ ok: true, siteId: "s1" });

    expect(db.site.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
      data: { template: "marquee", content: expect.any(String) },
    });
    // The limit is on new sites, not on edits.
    expect(db.site.count).not.toHaveBeenCalled();
    expect(db.site.create).not.toHaveBeenCalled();
  });

  it("answers errors.siteNotFound for someone else's site", async () => {
    db.site.updateMany.mockResolvedValue({ count: 0 });
    expect(await saveSite({ ...validSite, siteId: "theirs" })).toEqual({
      ok: false,
      error: { key: "errors.siteNotFound" },
    });
    expect(db.site.create).not.toHaveBeenCalled();
  });

  it("keeps only the caller's own media, in the order given", async () => {
    db.media.findMany.mockResolvedValue([{ id: "m3" }, { id: "m1" }]);
    db.site.count.mockResolvedValue(0);
    db.site.create.mockResolvedValue({ id: "s1" });

    await saveSite({
      template: "marquee",
      content: { name: "Ana Lee", mediaIds: ["m1", "foreign", "m3", "m1"] },
    });

    expect(db.media.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "foreign", "m3"] }, profile: { userId: "u1" } },
      select: { id: true },
    });
    const { data } = (db.site.create.mock.calls[0] as [{ data: { content: string } }])[0];
    expect(JSON.parse(data.content).mediaIds).toEqual(["m1", "m3"]);
  });
});

describe("startSiteCheckout", () => {
  beforeEach(() => signIn("TALENT"));

  function ownSiteUnpaid() {
    db.site.findFirst.mockResolvedValue({ id: "s1" });
    db.siteOrder.findFirst.mockResolvedValue(null);
    db.studentPriceRequest.findUnique.mockResolvedValue(null);
  }

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
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder({ offer: "signature", amountCents: 19900 }));
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.subscription.upsert.mockResolvedValue({ compUntil: null });

    expect(await startSiteCheckout({ siteId: "s1", offer: "signature" })).toEqual({ ok: true });

    expect(tx.siteOrder.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        siteId: "s1",
        offer: "signature",
        amountCents: 19900,
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
      amountCents: 19900,
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

  it("charges the regular price to an approved student while no student price is set", async () => {
    ownSiteUnpaid();
    db.studentPriceRequest.findUnique.mockResolvedValue({ status: "APPROVED" });
    tx.siteOrder.create.mockResolvedValue({ id: "o1" });
    tx.siteOrder.findUnique.mockResolvedValue(pendingOrder());
    tx.siteOrder.updateMany.mockResolvedValue({ count: 1 });
    tx.subscription.upsert.mockResolvedValue({ compUntil: null });

    await startSiteCheckout({ siteId: "s1", offer: "essential" });

    expect(tx.siteOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountCents: 9900, studentDiscount: false }),
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

describe("publishSite", () => {
  beforeEach(() => signIn("TALENT"));

  const draft = (over: Record<string, unknown> = {}) => ({
    id: "cmwsite0001abcdefgh",
    status: "DRAFT",
    subdomain: null,
    content: JSON.stringify({ name: "Chloé Müller" }),
    ...over,
  });

  function published(): { status: string; publishedAt: Date; subdomain: string } {
    return (tx.site.update.mock.calls.at(-1) as [{ data: { status: string; publishedAt: Date; subdomain: string } }])[0].data;
  }

  it("answers errors.siteNotFound for someone else's site", async () => {
    db.site.findFirst.mockResolvedValue(null);

    expect(await publishSite("theirs")).toEqual({ ok: false, error: { key: "errors.siteNotFound" } });
    expect(db.site.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "theirs", userId: "u1" } })
    );
    expect(db.siteOrder.findFirst).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("answers errors.sitePaymentRequired without a paid order", async () => {
    db.site.findFirst.mockResolvedValue(draft());
    db.siteOrder.findFirst.mockResolvedValue(null);

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({
      ok: false,
      error: { key: "errors.sitePaymentRequired" },
    });
    // Only a PAID order counts: not a pending, canceled or refunded one.
    expect(db.siteOrder.findFirst).toHaveBeenCalledWith({
      where: { siteId: "cmwsite0001abcdefgh", status: "PAID" },
      select: { id: true },
    });
    expectNoWrites();
  });

  it("publishes a paid site at a subdomain made from its name, with an audit entry", async () => {
    db.site.findFirst.mockResolvedValue(draft());
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });
    db.site.findMany.mockResolvedValue([]);

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({ ok: true, subdomain: "chloe-muller" });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.site.update).toHaveBeenCalledWith({
      where: { id: "cmwsite0001abcdefgh" },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date), subdomain: "chloe-muller" },
    });
    expect(audits()[0]).toMatchObject({
      actorUserId: "u1",
      action: "limelight.site.publish",
      resourceType: "Site",
      resourceId: "cmwsite0001abcdefgh",
    });
    expect(JSON.parse(audits()[0].after)).toMatchObject({ status: "PUBLISHED", subdomain: "chloe-muller" });
  });

  it("numbers the subdomain when the name is taken", async () => {
    db.site.findFirst.mockResolvedValue(draft());
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });
    db.site.findMany.mockResolvedValue([{ subdomain: "chloe-muller" }, { subdomain: "chloe-muller-2" }]);

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({ ok: true, subdomain: "chloe-muller-3" });
    expect(tx.site.update).toHaveBeenCalledTimes(1);
  });

  it("moves to the next name when another site takes one between the lookup and the write", async () => {
    db.site.findFirst.mockResolvedValue(draft());
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });
    db.site.findMany.mockResolvedValue([]);
    // The unique index on Site.subdomain refuses the first write.
    tx.site.update.mockRejectedValueOnce({ code: "P2002" });

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({ ok: true, subdomain: "chloe-muller-2" });
    expect(tx.site.update).toHaveBeenCalledTimes(2);
    // The refused attempt wrote no audit entry.
    expect(audits()).toHaveLength(1);
  });

  it("rethrows a database error that is not a name collision", async () => {
    db.site.findFirst.mockResolvedValue(draft());
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });
    db.site.findMany.mockResolvedValue([]);
    tx.site.update.mockRejectedValue(new Error("connection reset"));

    await expect(publishSite("cmwsite0001abcdefgh")).rejects.toThrow("connection reset");
    expect(tx.site.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a name in a non-Latin script", "李娜"],
    ["a reserved word", "Admin"],
    ["a two-letter name", "Al"],
  ])("falls back to the site id for %s", async (_label, name) => {
    db.site.findFirst.mockResolvedValue(draft({ content: JSON.stringify({ name }) }));
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });
    db.site.findMany.mockResolvedValue([]);

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({ ok: true, subdomain: "site-cmwsite0" });
  });

  it("gives a site that was published before the subdomain it had", async () => {
    db.site.findFirst.mockResolvedValue(
      draft({ subdomain: "chloe", content: JSON.stringify({ name: "Chloé Müller-Dupont" }) })
    );
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({ ok: true, subdomain: "chloe" });
    expect(db.site.findMany).not.toHaveBeenCalled();
    expect(published()).toMatchObject({ status: "PUBLISHED", subdomain: "chloe" });
  });

  it("changes nothing for a site that is already online", async () => {
    db.site.findFirst.mockResolvedValue(draft({ status: "PUBLISHED", subdomain: "chloe-muller" }));
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({ ok: true, subdomain: "chloe-muller" });
    expectNoWrites();
  });

  it("answers errors.siteInvalid when the stored content no longer parses", async () => {
    db.site.findFirst.mockResolvedValue(draft({ content: "{}" }));
    db.siteOrder.findFirst.mockResolvedValue({ id: "o1" });

    expect(await publishSite("cmwsite0001abcdefgh")).toEqual({
      ok: false,
      error: { key: "errors.siteInvalid" },
    });
    expectNoWrites();
  });
});

describe("unpublishSite", () => {
  beforeEach(() => signIn("TALENT"));

  it("puts the caller's site back to DRAFT and keeps its subdomain", async () => {
    db.site.updateMany.mockResolvedValue({ count: 1 });

    expect(await unpublishSite("s1")).toEqual({ ok: true });
    // Only the status is written: the subdomain stays where it is.
    expect(db.site.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
      data: { status: "DRAFT" },
    });
    expect(audits(db)[0]).toMatchObject({ action: "limelight.site.unpublish", resourceId: "s1" });
  });

  it("answers errors.siteNotFound for someone else's site", async () => {
    db.site.updateMany.mockResolvedValue({ count: 0 });

    expect(await unpublishSite("theirs")).toEqual({ ok: false, error: { key: "errors.siteNotFound" } });
    expect(db.auditLog.create).not.toHaveBeenCalled();
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

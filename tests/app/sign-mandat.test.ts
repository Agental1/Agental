import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * signMandat with a mocked Prisma. What is under test is the shape of the
 * signature: the mandate, the Free plan, the profile status and the audit
 * entry go through one transaction, each mandate write is conditional, and a
 * request that loses the race writes nothing. Rolling back on a throw is
 * Postgres's part, through Prisma's interactive transaction.
 */

const tx = {
  mandat: { updateMany: vi.fn(), createManyAndReturn: vi.fn() },
  subscription: { upsert: vi.fn() },
  artistProfile: { update: vi.fn() },
  user: { update: vi.fn() },
  auditLog: { create: vi.fn() },
};
// Reads and the transaction only: a write outside the transaction would hit
// a missing method and fail the test.
const db = {
  artistProfile: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const recomputeCompleteness = vi.fn(async () => 40);
const redirect = vi.fn((args: unknown) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { args });
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/completeness", () => ({ recomputeCompleteness }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1", kind: "TALENT" } }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect }));

const { signMandat } = await import("@/app/actions/onboarding");
const { MANDATE } = await import("@/domain/mandat");

type MandatRow = { id: string; status: string; signedAt: Date | null };

const profile = (mandat: MandatRow | null = null) => ({
  id: "p1",
  userId: "u1",
  stageName: "Ana Lee",
  birthDate: new Date("1995-04-02T00:00:00Z"),
  isMinor: false,
  mandat,
  _count: { specialties: 1 },
});

const revoked: MandatRow = {
  id: "m0",
  status: "REVOKED",
  signedAt: new Date("2026-01-05T10:00:00Z"),
};

function auditData(): Record<string, string> {
  return (tx.auditLog.create.mock.calls[0] as [{ data: Record<string, string> }])[0].data;
}

beforeEach(() => {
  // Back to the implementations given to vi.fn above, queued values dropped.
  vi.resetAllMocks();
  // These tests cover the signature itself, so they run as if counsel had
  // approved a version. The block at the end covers the beta, where none is.
  MANDATE.approvedVersion = "test-v1";
});

afterAll(() => {
  MANDATE.approvedVersion = null;
});

describe("signMandat", () => {
  it("signs a first mandate with the plan, the status and the audit entry in one transaction", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile());
    tx.mandat.createManyAndReturn.mockResolvedValue([{ id: "m1" }]);

    await expect(signMandat({ accept: true })).rejects.toThrow("NEXT_REDIRECT");

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.mandat.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          profileId: "p1",
          status: "ACTIVE",
          signedAt: expect.any(Date),
          signatureIp: "203.0.113.7",
          documentVersion: "test-v1",
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    expect(tx.mandat.updateMany).not.toHaveBeenCalled();
    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subjectId: "u1" }, update: {} })
    );
    expect(tx.artistProfile.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "ACTIVE" },
    });
    expect(auditData()).toMatchObject({
      actorUserId: "u1",
      action: "mandat.sign",
      resourceType: "Mandat",
      resourceId: "m1",
    });
    expect(JSON.parse(auditData().after)).toMatchObject({
      ip: "203.0.113.7",
      documentVersion: "test-v1",
    });

    // The score is refreshed after the transaction, outside the legal act.
    expect(recomputeCompleteness).toHaveBeenCalledWith("p1");
    expect(recomputeCompleteness.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.auditLog.create.mock.invocationCallOrder[0]
    );
    expect(redirect).toHaveBeenCalledWith({
      href: { pathname: "/talents/app", query: { welcome: "1" } },
      locale: "en",
    });
  });

  it("signs a revoked mandate again only while it is still unsigned", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile(revoked));
    tx.mandat.updateMany.mockResolvedValue({ count: 1 });

    await expect(signMandat({ accept: true })).rejects.toThrow("NEXT_REDIRECT");

    expect(tx.mandat.updateMany).toHaveBeenCalledWith({
      where: { id: "m0", OR: [{ status: { not: "ACTIVE" } }, { signedAt: null }] },
      data: {
        status: "ACTIVE",
        signedAt: expect.any(Date),
        signatureIp: "203.0.113.7",
        documentVersion: "test-v1",
        revokedAt: null,
      },
    });
    expect(tx.mandat.createManyAndReturn).not.toHaveBeenCalled();
    expect(auditData().resourceId).toBe("m0");
  });

  it.each([
    {
      label: "a first signature",
      mandat: null,
      lose: () => tx.mandat.createManyAndReturn.mockResolvedValue([]),
    },
    {
      label: "a revoked mandate",
      mandat: revoked,
      lose: () => tx.mandat.updateMany.mockResolvedValue({ count: 0 }),
    },
  ])("writes nothing more when another request signed $label first", async ({ mandat, lose }) => {
    db.artistProfile.findUnique.mockResolvedValue(profile(mandat));
    lose();

    expect(await signMandat({ accept: true })).toEqual({
      ok: false,
      error: { key: "errors.mandatAlreadySigned" },
    });
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.artistProfile.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(recomputeCompleteness).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lets a failed write escape the transaction, so nothing of the signature is kept", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile());
    tx.mandat.createManyAndReturn.mockResolvedValue([{ id: "m1" }]);
    tx.artistProfile.update.mockRejectedValue(new Error("connection reset"));

    await expect(signMandat({ accept: true })).rejects.toThrow("connection reset");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(recomputeCompleteness).not.toHaveBeenCalled();
  });

  it("still redirects when the score refresh fails after the commit", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile());
    tx.mandat.createManyAndReturn.mockResolvedValue([{ id: "m1" }]);
    recomputeCompleteness.mockRejectedValue(new Error("timeout"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(signMandat({ accept: true })).rejects.toThrow("NEXT_REDIRECT");
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("refuses a signed mandate before opening a transaction", async () => {
    db.artistProfile.findUnique.mockResolvedValue(
      profile({ id: "m0", status: "ACTIVE", signedAt: new Date("2026-11-01T09:00:00Z") })
    );

    expect(await signMandat({ accept: true })).toEqual({
      ok: false,
      error: { key: "errors.mandatAlreadySigned" },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("signMandat during the beta", () => {
  it("refuses and writes nothing while no agreement version is approved", async () => {
    MANDATE.approvedVersion = null;
    db.artistProfile.findUnique.mockResolvedValue(profile());

    expect(await signMandat({ accept: true })).toEqual({
      ok: false,
      error: { key: "errors.mandatUnavailable" },
    });
    // Refused before anything is read, so nothing can be written.
    expect(db.artistProfile.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("ships with no approved version", async () => {
    // The real module, not the value these tests set: the repository must not
    // carry an approved version until counsel has approved a text.
    vi.resetModules();
    const fresh = await vi.importActual<typeof import("@/domain/mandat")>("@/domain/mandat");
    expect(fresh.MANDATE.approvedVersion).toBeNull();
  });
});

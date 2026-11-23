import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * completeBetaOnboarding with a mocked Prisma: the wizard's last button during
 * the beta. What is under test: it never touches a mandate, it stamps the
 * first run once, and it names the missing step instead of pretending.
 */

const tx = {
  subscription: { upsert: vi.fn() },
  user: { updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
// No `mandat` and no `artistProfile.update` on purpose: a write to either
// would hit a missing method and fail the test.
const db = {
  artistProfile: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const recomputeCompleteness = vi.fn(async () => 40);
const redirect = vi.fn((args: unknown) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { args });
});
const session = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/completeness", () => ({ recomputeCompleteness }));
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect }));

const { completeBetaOnboarding } = await import("@/app/actions/onboarding");

const profile = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  legalFirstName: "Maya",
  legalLastName: "Okafor",
  legalName: null,
  birthDate: new Date("1995-04-02T00:00:00Z"),
  gender: "female",
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ user: { id: "u1", kind: "TALENT" } });
});

describe("completeBetaOnboarding", () => {
  it("finishes setup the first time: Free plan, one stamp, one audit entry, profile with the tutorial", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile());
    tx.user.updateMany.mockResolvedValue({ count: 1 });

    expect(await completeBetaOnboarding()).toEqual({
      ok: true,
      nextStep: null,
      path: "/talents/app?welcome=1",
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subjectId: "u1" },
        create: expect.objectContaining({ plan: "FREE", priceCents: 0 }),
        update: {},
      })
    );
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", onboardingCompletedAt: null },
      data: { onboardingCompletedAt: expect.any(Date) },
    });
    const audit = (tx.auditLog.create.mock.calls[0] as [{ data: Record<string, string> }])[0].data;
    expect(audit).toMatchObject({
      actorUserId: "u1",
      action: "onboarding.complete",
      resourceType: "ArtistProfile",
      resourceId: "p1",
    });
    // The record says outright that no agreement was accepted.
    expect(JSON.parse(audit.after)).toMatchObject({ mandate: "none" });
    expect(recomputeCompleteness).toHaveBeenCalledWith("p1");
  });

  it("is safe to repeat: a second call stamps nothing, audits nothing and points at the dashboard", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile());
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    expect(await completeBetaOnboarding()).toEqual({
      ok: true,
      nextStep: null,
      path: "/talents/app",
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["no profile row yet", null, "identity"],
    ["no legal last name", profile({ legalLastName: "" }), "identity"],
    ["no date of birth", profile({ birthDate: null }), "profile"],
    ["no gender (round 10)", profile({ gender: null }), "profile"],
  ] as const)("names the missing step and changes nothing: %s", async (_label, row, step) => {
    db.artistProfile.findUnique.mockResolvedValue(row);

    expect(await completeBetaOnboarding()).toEqual({
      ok: true,
      nextStep: step,
      path: "/talents/app",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(recomputeCompleteness).not.toHaveBeenCalled();
  });

  it("still answers when the completeness refresh fails", async () => {
    db.artistProfile.findUnique.mockResolvedValue(profile());
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    recomputeCompleteness.mockRejectedValue(new Error("busy"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await completeBetaOnboarding()).toMatchObject({ ok: true, nextStep: null });
    quiet.mockRestore();
  });

  it("sends a signed-out visitor, or a casting account, to sign in", async () => {
    session.mockResolvedValue(null);
    await expect(completeBetaOnboarding()).rejects.toThrow("NEXT_REDIRECT");
    session.mockResolvedValue({ user: { id: "c1", kind: "CASTING" } });
    await expect(completeBetaOnboarding()).rejects.toThrow("NEXT_REDIRECT");
    expect(db.artistProfile.findUnique).not.toHaveBeenCalled();
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 12.1, group 2: the Privacy Policy box, the representation step and the
 * plans step are three separate records. The representation acknowledgment is
 * not a signature: it never writes Mandat.signedAt. Local database only.
 */
const P = "test-r121g2-";
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/completeness", () => ({ recomputeCompleteness: async () => 0 }));

const { acknowledgeRepresentationStep, recordPlansStep } = await import("@/app/actions/onboarding");
const { acceptanceColumns, PLANS_STEP_VERSION, REPRESENTATION_STEP_VERSION } = await import("@/domain/legal-versions");
const { MANDATE } = await import("@/domain/mandat");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
let userId: string;
let profileId: string;

describe.skipIf(!local)("three separate acceptances", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `${P}a@test.local`, passwordHash: "x", kind: "TALENT", ...acceptanceColumns(false) },
    });
    userId = u.id;
    profileId = (await prisma.artistProfile.create({ data: { userId, stageName: "" } })).id;
    session.mockResolvedValue({ user: { id: userId, kind: "TALENT" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("keeps signing closed", () => {
    expect(MANDATE.approvedVersion).toBeNull();
  });

  it("the representation acknowledgment writes its own record and never signs", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(before.representationAckAt).toBeNull();
    expect(await acknowledgeRepresentationStep()).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.representationAckAt).toBeInstanceOf(Date);
    expect(after.representationAckVersion).toBe(REPRESENTATION_STEP_VERSION);
    // The others are untouched.
    expect(after.privacyAcceptedAt?.getTime()).toBe(before.privacyAcceptedAt?.getTime());
    expect(after.plansStepAt).toBeNull();
    expect(after.termsAcceptedAt).toBeNull();
    // No signature: no Mandat row at all, then an unsigned row stays unsigned.
    expect(await prisma.mandat.count({ where: { profileId } })).toBe(0);
    await prisma.mandat.create({ data: { profileId, status: "ACTIVE", signedAt: null } });
    await acknowledgeRepresentationStep();
    expect((await prisma.mandat.findUniqueOrThrow({ where: { profileId } })).signedAt).toBeNull();
    // Idempotent: a second acknowledgment keeps the first date.
    const again = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(again.representationAckAt?.getTime()).toBe(after.representationAckAt?.getTime());
  });

  it("the plans step writes its own record and changes no subscription", async () => {
    const pre = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await recordPlansStep("PRO")).toEqual({ ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.plansStepAt).toBeInstanceOf(Date);
    expect(after.plansStepVersion).toBe(PLANS_STEP_VERSION);
    expect(after.plansStepChoice).toBe("PRO");
    expect(after.representationAckAt?.getTime()).toBe(pre.representationAckAt?.getTime());
    expect(after.privacyVersion).toBe(pre.privacyVersion);
    expect(await prisma.subscription.count({ where: { subjectId: userId } })).toBe(0);
  });

  it("refuses an unknown plan with a translation key", async () => {
    const res = await recordPlansStep("GOLD");
    expect(res).toMatchObject({ ok: false, error: { key: "errors.invalidPlan" } });
  });
});

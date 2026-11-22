import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { completeProfile } from "../helpers/complete-profile";
import { launchFirstAutoSearch } from "@/lib/auto-search";
import { recomputeCompleteness } from "@/lib/completeness";
import { startRoleSearch } from "@/lib/role-search";
import { RoleSearchClientKey } from "@/domain/role-search";

/**
 * The first AI search starts on its own once the profile is complete and the
 * email verified (round 7b, 4.1): once per account, under the click's rules,
 * and inside the plan's automatic cap.
 */
const P = "test-autosearch-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

describe("client keys", () => {
  it("refuses a browser key that claims to be automatic", () => {
    expect(RoleSearchClientKey.safeParse("auto_first").success).toBe(false);
    expect(RoleSearchClientKey.safeParse("click_12345678").success).toBe(true);
  });
});

describe.skipIf(!local)("first automatic search", () => {
  let ready = "";
  let thin = "";
  let unverified = "";
  beforeAll(async () => {
    const make = async (name: string, data: Record<string, unknown>, complete = true) =>
      (
        await prisma.user.create({
          data: {
            email: `${P}${name}@test.local`,
            kind: "TALENT",
            accountStatus: "TEST",
            ...data,
            artistProfile: {
              create: { stageName: name, birthDate: new Date("1990-01-01T00:00:00Z"), ...(complete ? completeProfile(`${P}${name}`) : {}) },
            },
          },
        })
      ).id;
    ready = await make("ready", { emailVerified: new Date() });
    thin = await make("thin", { emailVerified: new Date() }, false);
    unverified = await make("unverified", { passwordHash: "x" });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("starts once for a verified, complete account, and stamps the opt-in", async () => {
    const profile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: ready } });
    expect(await recomputeCompleteness(profile.id)).toBe(100);
    const rows = await prisma.roleSearchRequest.findMany({ where: { userId: ready } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientKey: "auto_first", status: "queued" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ready } })).agentsOptInAt).not.toBeNull();
    // Never twice.
    expect(await launchFirstAutoSearch(ready)).toBeNull();
    await recomputeCompleteness(profile.id);
    expect(await prisma.roleSearchRequest.count({ where: { userId: ready } })).toBe(1);
  });

  it("keeps the automatic cap inside the allowance, and clicks still work", async () => {
    const scheduled = await startRoleSearch(ready, "auto6h_test", new Date(), undefined, true);
    expect(scheduled).toMatchObject({ ok: false, reason: "auto_exhausted" });
    const click = await startRoleSearch(ready, "click_00000001");
    expect(click.ok).toBe(true);
  });

  it("starts nothing for an incomplete profile or an unverified email", async () => {
    const profile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: thin } });
    expect(await recomputeCompleteness(profile.id)).toBeLessThan(100);
    expect(await launchFirstAutoSearch(thin)).toMatchObject({ ok: false, reason: "ineligible", why: "profile_incomplete" });
    expect(await launchFirstAutoSearch(unverified)).toMatchObject({ ok: false, reason: "ineligible", why: "email_unverified" });
    expect(await prisma.roleSearchRequest.count({ where: { userId: { in: [thin, unverified] } } })).toBe(0);
  });
});

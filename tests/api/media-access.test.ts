import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { canReadMedia } from "@/lib/media-access";

/**
 * Integration test against the real database, on purpose.
 *
 * /api/media/[id] shipped with NO authentication: it streamed any Media row to
 * anyone who knew an id, self-tapes and minors' media included. The fix hinges
 * on the SHAPE of the membership query, so a mocked Prisma would only assert
 * the mock. This builds a real graph — two organisations, one candidature —
 * and checks that the wrong organisation is refused.
 *
 * Every row is prefixed and removed in afterAll, so a failing run cannot leave
 * fixtures behind in the dev database.
 */
const P = "test-media-access-";

let ownerUserId: string;
let profileId: string;
let adminUserId: string;
let strangerUserId: string;
let insiderUserId: string;
let outsiderUserId: string;

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: { email: `${P}owner@test.local`, kind: "TALENT" },
  });
  ownerUserId = owner.id;
  const profile = await prisma.artistProfile.create({
    data: { userId: owner.id, stageName: `${P}profile` },
  });
  profileId = profile.id;

  const admin = await prisma.user.create({
    data: { email: `${P}admin@test.local`, kind: "TALENT", isAdmin: true },
  });
  adminUserId = admin.id;

  const stranger = await prisma.user.create({
    data: { email: `${P}stranger@test.local`, kind: "TALENT" },
  });
  strangerUserId = stranger.id;

  // Two casting organisations. Only the first has a candidature on the profile.
  const [insiderOrg, outsiderOrg] = await Promise.all([
    prisma.organization.create({ data: { name: `${P}insider` } }),
    prisma.organization.create({ data: { name: `${P}outsider` } }),
  ]);

  const [insider, outsider] = await Promise.all([
    prisma.user.create({ data: { email: `${P}insider@test.local`, kind: "CASTING" } }),
    prisma.user.create({ data: { email: `${P}outsider@test.local`, kind: "CASTING" } }),
  ]);
  insiderUserId = insider.id;
  outsiderUserId = outsider.id;

  await Promise.all([
    prisma.membership.create({
      data: { userId: insider.id, organizationId: insiderOrg.id, role: "OWNER" },
    }),
    prisma.membership.create({
      data: { userId: outsider.id, organizationId: outsiderOrg.id, role: "OWNER" },
    }),
  ]);

  const project = await prisma.project.create({
    data: { organizationId: insiderOrg.id, title: `${P}project` },
  });
  await prisma.candidature.create({
    data: { projectId: project.id, artistProfileId: profile.id },
  });
});

afterAll(async () => {
  // Order matters: candidatures and memberships reference the rest.
  await prisma.candidature.deleteMany({
    where: { project: { title: { startsWith: P } } },
  });
  await prisma.project.deleteMany({ where: { title: { startsWith: P } } });
  await prisma.membership.deleteMany({
    where: { organization: { name: { startsWith: P } } },
  });
  await prisma.organization.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.artistProfile.deleteMany({ where: { stageName: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  await prisma.$disconnect();
});

describe("canReadMedia", () => {
  it("lets the talent read their own media", async () => {
    expect(await canReadMedia(ownerUserId, profileId)).toBe(true);
  });

  it("lets an admin read, for the minors back-office", async () => {
    expect(await canReadMedia(adminUserId, profileId)).toBe(true);
  });

  it("lets a casting user read a profile their organisation shortlisted", async () => {
    expect(await canReadMedia(insiderUserId, profileId)).toBe(true);
  });

  it("refuses a casting user from another organisation", async () => {
    // The whole point of scoping by membership: being a casting account is not
    // enough to read every talent's media.
    expect(await canReadMedia(outsiderUserId, profileId)).toBe(false);
  });

  it("refuses an unrelated talent", async () => {
    expect(await canReadMedia(strangerUserId, profileId)).toBe(false);
  });

  it("refuses an unknown user id", async () => {
    expect(await canReadMedia("no-such-user", profileId)).toBe(false);
  });

  it("refuses an unknown profile id", async () => {
    expect(await canReadMedia(ownerUserId, "no-such-profile")).toBe(false);
  });
});

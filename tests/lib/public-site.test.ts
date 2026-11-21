import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { publicSiteByName } from "@/lib/limelight/public-site";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const email = "test-public-site@test.local";

describe.skipIf(!local)("published site at /s/<name>", () => {
  let siteId: string;
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email, kind: "TALENT" } });
    const site = await prisma.site.create({
      data: { userId: u.id, template: "marquee", status: "PUBLISHED", subdomain: "test-public-ana", showContact: false },
    });
    siteId = site.id;
    const rev = await prisma.siteRevision.create({
      data: { siteId, version: 1, template: "marquee", content: JSON.stringify({ name: "Ana", contactEmail: "ana@x.co" }) },
    });
    await prisma.site.update({ where: { id: siteId }, data: { publishedRevisionId: rev.id } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("serves a published site and hides contact details while the switch is off", async () => {
    const s = await publicSiteByName("test-public-ana");
    expect(s?.content.name).toBe("Ana");
    expect(s?.content.contactEmail).toBeUndefined();
  });

  it("is gone as soon as the site is taken offline", async () => {
    await prisma.site.update({ where: { id: siteId }, data: { status: "DRAFT", publishedRevisionId: null } });
    expect(await publicSiteByName("test-public-ana")).toBeNull();
    expect(await publicSiteByName("../etc")).toBeNull();
  });
});

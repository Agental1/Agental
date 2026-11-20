import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncAccountPrefs } from "@/lib/account-prefs";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const email = "test-prefs-sync@test.local";
let id: string;

describe.skipIf(!local)("choices saved on the account", () => {
  beforeAll(async () => {
    id = (await prisma.user.create({ data: { email, kind: "TALENT", locale: "en" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("remembers the language used in the app", async () => {
    await syncAccountPrefs(id, "fr");
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).locale).toBe("fr");
  });

  it("hands back the cookie choice saved on the account, or nothing", async () => {
    expect((await syncAccountPrefs(id, "fr")).consent).toBeNull();
    await prisma.user.update({
      where: { id },
      data: { consentAnalytics: true, consentMarketing: false, consentAt: new Date() },
    });
    expect((await syncAccountPrefs(id, "fr")).consent).toEqual({ analytics: true, marketing: false });
  });
});

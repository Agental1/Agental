import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { drainConfirmations, MAX_ATTEMPTS } from "@/lib/limelight/confirmation";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const P = "test-r9-llconf-";
const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Agental <contact@agental.test>", NEXT_PUBLIC_SITE_URL: "https://www.agental.co" };

describe.skipIf(!local)("Limelight confirmation", () => {
  const sent: { to: string; kind?: string; subject: string; text: string }[] = [];
  const ok = async (m: (typeof sent)[number]) => (sent.push(m), { ok: true as const, mode: "resend" as const });
  const fail = async () => ({ ok: false as const });

  beforeEach(async () => {
    sent.length = 0;
    await prisma.limelightLead.deleteMany({ where: { email: { startsWith: P } } });
    // Only this test's rows are pending: everything else is left as it was.
    await prisma.limelightLead.updateMany({ where: { confirmation: "pending" }, data: { confirmation: "before_r9" } });
  });
  afterAll(async () => {
    await prisma.limelightLead.deleteMany({ where: { email: { startsWith: P } } });
  });

  const lead = (n: string, confirmation = "pending") =>
    prisma.limelightLead.create({ data: { reference: `LL-T${n}${Date.now() % 100000}`, email: `${P}${n}@agental.test`, name: "Test", source: "test", consentVersion: "test", locale: "en", confirmation } });

  it("sends once, with the reference, and never again", async () => {
    const l = await lead("a");
    expect(await drainConfirmations({ env, send: ok as never })).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: l.email, kind: "limelight_confirmation" });
    expect(sent[0].text).toContain(l.reference);
    expect(sent[0].text).toContain("https://www.agental.co/en/talents/limelight");
    expect(await drainConfirmations({ env, send: ok as never })).toMatchObject({ sent: 0 });
    expect((await prisma.limelightLead.findUnique({ where: { id: l.id } }))?.confirmation).toBe("sent");
  });

  it("retries a failure, then gives up", async () => {
    const l = await lead("b");
    for (let i = 0; i < MAX_ATTEMPTS; i++) await drainConfirmations({ env, send: fail as never });
    expect((await prisma.limelightLead.findUnique({ where: { id: l.id } }))?.confirmation).toBe("failed");
  });

  it("never confirms a request from before round 9, and claims nothing without a sender", async () => {
    await lead("c", "before_r9");
    const p = await lead("d");
    expect(await drainConfirmations({ env, send: ok as never })).toMatchObject({ sent: 1 });
    expect(sent.map((m) => m.to)).toEqual([p.email]);
    await lead("e");
    expect(await drainConfirmations({ env: {}, send: ok as never })).toEqual({ sent: 0, failed: 0, configured: false });
  });
});

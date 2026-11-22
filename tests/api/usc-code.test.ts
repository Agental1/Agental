import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/** USC student verification by a 6-digit code (round 8b), on the real local database. */
const P = "test-usccode-";
type Mail = { to: string; subject: string; text: string; html: string };
const sent: Mail[] = [];
let configured = true;
vi.mock("@/lib/mailer", () => ({
  emailSenderConfigured: () => configured,
  sendEmail: vi.fn(async (mail: Mail) => {
    sent.push(mail);
    return { ok: true as const, mode: "resend" as const };
  }),
}));
const { sendUscCode, verifyUscCode } = await import("@/lib/promo-verification");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const codeFrom = (m: Mail) => /\b(\d{6})\b/.exec(m.text)![1];
const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");
let a: string;
let b: string;

describe.skipIf(!local)("USC student verification by code", () => {
  beforeAll(async () => {
    a = (await prisma.user.create({ data: { email: `${P}a@test.local`, name: "a", kind: "TALENT" } })).id;
    b = (await prisma.user.create({ data: { email: `${P}b@test.local`, name: "b", kind: "TALENT" } })).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: [a, b] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("accepts only an address that ends in @usc.edu", async () => {
    for (const email of ["a@gmail.com", "a@cs.usc.edu", "a@usc.edu.evil.com", "a@notusc.edu"]) {
      expect(await sendUscCode({ userId: a, email, locale: "en" })).toEqual({ ok: false, reason: "invalid_email" });
    }
  });

  it("stores only a hash, and waits 60 seconds before a resend", async () => {
    const t0 = new Date();
    expect(await sendUscCode({ userId: a, email: "Trojan@USC.edu", locale: "en", now: t0 })).toEqual({ ok: true });
    const mail = sent.at(-1)!;
    expect(mail.to).toBe("trojan@usc.edu");
    const row = await prisma.promoVerificationCode.findFirstOrThrow({ where: { userId: a } });
    expect(row.codeHash).not.toContain(codeFrom(mail));
    expect(row.expiresAt.getTime() - t0.getTime()).toBe(10 * 60 * 1000);
    const soon = await sendUscCode({ userId: a, email: "trojan@usc.edu", locale: "en", now: new Date(t0.getTime() + 30_000) });
    expect(soon).toMatchObject({ ok: false, reason: "too_soon" });
  });

  it("counts wrong codes and locks after 5 tries", async () => {
    const code = codeFrom(sent.at(-1)!);
    for (let left = 4; left >= 1; left--) {
      expect(await verifyUscCode({ userId: a, code: wrongFor(code) })).toEqual({ ok: false, reason: "wrong", attemptsLeft: left });
    }
    expect(await verifyUscCode({ userId: a, code: wrongFor(code) })).toEqual({ ok: false, reason: "locked" });
    // Even the right code is refused once locked.
    expect(await verifyUscCode({ userId: a, code })).toEqual({ ok: false, reason: "locked" });
  });

  it("refuses an expired code", async () => {
    const t0 = new Date(Date.now() + 2 * 60_000);
    await sendUscCode({ userId: a, email: "trojan@usc.edu", locale: "en", now: t0 });
    const code = codeFrom(sent.at(-1)!);
    expect(await verifyUscCode({ userId: a, code, now: new Date(t0.getTime() + 11 * 60_000) })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("marks the account USC student verified on the right code, once", async () => {
    const t0 = new Date(Date.now() + 4 * 60_000);
    await sendUscCode({ userId: b, email: "fight.on@usc.edu", locale: "en", now: t0 });
    const code = codeFrom(sent.at(-1)!);
    const res = await verifyUscCode({ userId: b, code, now: t0 });
    expect(res).toMatchObject({ ok: true, email: "fight.on@usc.edu" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: b } });
    expect(user.uscVerifiedAt).not.toBeNull();
    expect(user.uscVerifiedEmail).toBe("fight.on@usc.edu");
    expect(await verifyUscCode({ userId: b, code, now: t0 })).toEqual({ ok: false, reason: "expired" });
    expect(await sendUscCode({ userId: b, email: "fight.on@usc.edu", locale: "en" })).toEqual({ ok: false, reason: "already" });
  });

  it("says it cannot send in production without an email sender, and stores nothing", async () => {
    configured = false;
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const before = await prisma.promoVerificationCode.count({ where: { userId: a } });
    const res = await sendUscCode({ userId: a, email: "trojan@usc.edu", locale: "en", now: new Date(Date.now() + 10 * 60_000) });
    expect(res).toEqual({ ok: false, reason: "unavailable" });
    expect(await prisma.promoVerificationCode.count({ where: { userId: a } })).toBe(before);
    expect(warn).toHaveBeenCalled();
    vi.unstubAllEnvs();
    warn.mockRestore();
    configured = true;
  });
});

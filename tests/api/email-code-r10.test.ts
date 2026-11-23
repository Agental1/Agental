import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/** Round 10, group 2: the 6-digit sign-up code, on the real local database. */
const P = "test-emailcode-";
type Mail = { to: string; subject: string; text: string; html: string; kind?: string };
const sent: Mail[] = [];
let configured = true;
vi.mock("@/lib/mailer", () => ({
  emailSenderConfigured: () => configured,
  sendEmail: vi.fn(async (mail: Mail) => {
    sent.push(mail);
    return { ok: true as const, mode: "resend" as const };
  }),
}));
vi.mock("@/lib/auto-search", () => ({ launchFirstAutoSearch: vi.fn(async () => undefined) }));
const { sendEmailCode, verifyEmailCode, codeScreenState } = await import("@/lib/email-code");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const codeFrom = (m: Mail) => /\b(\d{6})\b/.exec(m.text)![1];
const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");
let a: string;
let b: string;

describe.skipIf(!local)("sign-up email code (round 10)", () => {
  beforeAll(async () => {
    a = (await prisma.user.create({ data: { email: `${P}a@test.local`, passwordHash: "x", kind: "TALENT", locale: "en" } })).id;
    b = (await prisma.user.create({ data: { email: `${P}b@test.local`, passwordHash: "x", kind: "TALENT", locale: "fr" } })).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: [a, b] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("sends the code to the account's address, stores only a hash, waits 60 seconds to resend", async () => {
    const t0 = new Date();
    expect(await sendEmailCode({ userId: a, now: t0 })).toEqual({ ok: true, email: `${P}a@test.local` });
    const mail = sent.at(-1)!;
    expect(mail.to).toBe(`${P}a@test.local`);
    expect(mail.kind).toBe("signup_code");
    expect(mail.text).toContain("verify your email");
    const row = await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: a } });
    expect(row.codeHash).not.toContain(codeFrom(mail));
    expect(row.expiresAt.getTime() - t0.getTime()).toBe(10 * 60 * 1000);
    expect(await sendEmailCode({ userId: a, now: new Date(t0.getTime() + 30_000) })).toMatchObject({ ok: false, reason: "too_soon" });
  });

  it("tells the code screen the server's own wait, so a reload keeps the countdown", async () => {
    const row = await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: a }, orderBy: { createdAt: "desc" } });
    const at = new Date(row.createdAt.getTime() + 20_000);
    expect(await codeScreenState(a, at)).toEqual({ live: true, cooldown: 40 });
    expect(await codeScreenState(a, new Date(row.createdAt.getTime() + 11 * 60_000))).toEqual({ live: false, cooldown: 0 });
  });

  it("counts wrong codes and locks after 5 tries, even for the right code", async () => {
    const code = codeFrom(sent.at(-1)!);
    for (let left = 4; left >= 1; left--) {
      expect(await verifyEmailCode({ userId: a, code: wrongFor(code) })).toEqual({ ok: false, reason: "wrong", attemptsLeft: left });
    }
    expect(await verifyEmailCode({ userId: a, code: wrongFor(code) })).toEqual({ ok: false, reason: "locked" });
    expect(await verifyEmailCode({ userId: a, code })).toEqual({ ok: false, reason: "locked" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a } });
    expect(user.emailVerified).toBeNull();
  });

  it("refuses an expired code", async () => {
    const t0 = new Date(Date.now() + 2 * 60_000);
    await sendEmailCode({ userId: a, now: t0 });
    const code = codeFrom(sent.at(-1)!);
    expect(await verifyEmailCode({ userId: a, code, now: new Date(t0.getTime() + 11 * 60_000) })).toEqual({ ok: false, reason: "expired" });
  });

  it("verifies the email on the right code, once, and audits it", async () => {
    const t0 = new Date(Date.now() + 4 * 60_000);
    await sendEmailCode({ userId: b, now: t0 });
    const code = codeFrom(sent.at(-1)!);
    expect(await verifyEmailCode({ userId: b, code: ` ${code.slice(0, 3)} ${code.slice(3)} `, now: t0 })).toEqual({ ok: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: b } });
    expect(user.emailVerified).not.toBeNull();
    expect(await verifyEmailCode({ userId: b, code, now: t0 })).toEqual({ ok: false, reason: "expired" });
    expect(await sendEmailCode({ userId: b })).toEqual({ ok: false, reason: "already" });
    expect(await prisma.auditLog.count({ where: { resourceId: b, action: "auth.email.verified" } })).toBe(1);
  });

  it("does not verify a changed address with a code sent to the old one", async () => {
    const t0 = new Date(Date.now() + 6 * 60_000);
    await sendEmailCode({ userId: a, now: t0 });
    const code = codeFrom(sent.at(-1)!);
    await prisma.user.update({ where: { id: a }, data: { email: `${P}a2@test.local` } });
    expect(await verifyEmailCode({ userId: a, code, now: t0 })).toEqual({ ok: false, reason: "expired" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).emailVerified).toBeNull();
    await prisma.user.update({ where: { id: a }, data: { email: `${P}a@test.local` } });
  });

  it("says it cannot send in production without an email sender, and stores nothing", async () => {
    configured = false;
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const before = await prisma.emailVerificationCode.count({ where: { userId: a } });
    expect(await sendEmailCode({ userId: a, now: new Date(Date.now() + 10 * 60_000) })).toEqual({ ok: false, reason: "unavailable" });
    expect(await prisma.emailVerificationCode.count({ where: { userId: a } })).toBe(before);
    vi.unstubAllEnvs();
    warn.mockRestore();
    configured = true;
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 11, group 1: the verification switch (Admin > Controls, off by
 * default), "Wrong email? Change it", and the 60-second wait for a new code,
 * on the real local database.
 */
const P = "test-emailgate-r11-";
type Mail = { to: string; subject: string; text: string; html: string; kind?: string };
const sent: Mail[] = [];
vi.mock("@/lib/mailer", () => ({
  emailSenderConfigured: () => true,
  sendEmail: vi.fn(async (mail: Mail) => {
    sent.push(mail);
    return { ok: true as const, mode: "resend" as const };
  }),
}));
vi.mock("@/lib/auto-search", () => ({ launchFirstAutoSearch: vi.fn(async () => undefined) }));
const { sendEmailCode, changeUnverifiedEmail, verifyEmailCode } = await import("@/lib/email-code");
const { emailVerificationRequired, setEmailVerificationRequired } = await import("@/lib/app-settings");
const { mustVerifyEmail } = await import("@/lib/email-gate");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const KEY = "email.verification.required";
let admin: string;
let pw: string;
let google: string;
let verified: string;
let other: string;
let saved: { value: string; updatedById: string | null } | null = null;

describe.skipIf(!local)("email verification gate and email change (round 11)", () => {
  beforeAll(async () => {
    saved = await prisma.appSetting.findUnique({ where: { key: KEY }, select: { value: true, updatedById: true } });
    await prisma.appSetting.deleteMany({ where: { key: KEY } });
    admin = (await prisma.user.create({ data: { email: `${P}admin@test.local`, passwordHash: "x", kind: "TALENT", isAdmin: true, emailVerified: new Date() } })).id;
    pw = (await prisma.user.create({ data: { email: `${P}pw@test.local`, passwordHash: "x", kind: "TALENT", locale: "en" } })).id;
    google = (await prisma.user.create({ data: { email: `${P}google@test.local`, passwordHash: null, kind: "TALENT", emailVerified: new Date() } })).id;
    verified = (await prisma.user.create({ data: { email: `${P}ok@test.local`, passwordHash: "x", kind: "CASTING", emailVerified: new Date() } })).id;
    other = (await prisma.user.create({ data: { email: `${P}taken@test.local`, passwordHash: "x", kind: "TALENT" } })).id;
  });
  afterAll(async () => {
    const ids = [admin, pw, google, verified, other];
    await prisma.appSetting.deleteMany({ where: { key: KEY } });
    if (saved) await prisma.appSetting.create({ data: { key: KEY, ...saved } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ resourceId: { in: [...ids, KEY] } }, { actorUserId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("is off by default: nobody is held, with a sender configured", async () => {
    expect(await emailVerificationRequired()).toBe(false);
    expect(await mustVerifyEmail(pw)).toBe(false);
  });

  it("an unreadable value counts as off", async () => {
    await prisma.appSetting.create({ data: { key: KEY, value: "{not json" } });
    expect(await emailVerificationRequired()).toBe(false);
    expect(await mustVerifyEmail(pw)).toBe(false);
    await prisma.appSetting.delete({ where: { key: KEY } });
  });

  it("switched on (audited): holds the unverified password account, lets Google and verified ones pass", async () => {
    await setEmailVerificationRequired(admin, true);
    expect(await emailVerificationRequired()).toBe(true);
    expect(await mustVerifyEmail(pw)).toBe(true);
    expect(await mustVerifyEmail(google)).toBe(false);
    expect(await mustVerifyEmail(verified)).toBe(false);
    const log = await prisma.auditLog.findFirst({ where: { resourceId: KEY, action: "admin.emailGate.on", actorUserId: admin } });
    expect(log).not.toBeNull();
  });

  it("waits 60 seconds between two codes", async () => {
    const t0 = new Date();
    expect(await sendEmailCode({ userId: pw, now: t0 })).toMatchObject({ ok: true });
    const again = await sendEmailCode({ userId: pw, now: new Date(t0.getTime() + 59_000) });
    expect(again).toMatchObject({ ok: false, reason: "too_soon" });
    // The wait counts from the row's own timestamp (database clock): about one second left.
    const left = again.ok === false ? (again.retryInMs ?? 0) : 0;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(5_000);
  });

  it("refuses to take an address another account uses, or a bad one", async () => {
    expect(await changeUnverifiedEmail({ userId: pw, email: `${P}TAKEN@test.local` })).toEqual({ ok: false, reason: "taken" });
    expect(await changeUnverifiedEmail({ userId: pw, email: "not an email" })).toEqual({ ok: false, reason: "invalid" });
    expect(await changeUnverifiedEmail({ userId: pw, email: `${P}pw@test.local` })).toEqual({ ok: false, reason: "same" });
  });

  it("changes the address, drops the old code, sends a new one there, and audits without addresses", async () => {
    const oldCode = /\b(\d{6})\b/.exec(sent.at(-1)!.text)![1];
    // Links mailed to the old address before the change (review, round 11).
    const { createEmailToken } = await import("@/lib/email-tokens");
    await createEmailToken(prisma, { purpose: "verify", userId: pw, ttlMs: 3_600_000 });
    await createEmailToken(prisma, { purpose: "reset", userId: pw, ttlMs: 3_600_000 });
    const res = await changeUnverifiedEmail({ userId: pw, email: `  ${P}New@Test.local ` });
    expect(await prisma.verificationToken.count({ where: { identifier: { in: [`verify:${pw}`, `reset:${pw}`] } } })).toBe(0);
    expect(res).toEqual({ ok: true, email: `${P}new@test.local`, codeSent: true });
    expect(sent.at(-1)!.to).toBe(`${P}new@test.local`);
    expect(await verifyEmailCode({ userId: pw, code: oldCode })).toMatchObject({ ok: false });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: pw, action: "auth.email.changed" } });
    expect(JSON.stringify(log)).not.toContain("new@test.local");
    const newCode = /\b(\d{6})\b/.exec(sent.at(-1)!.text)![1];
    expect(await verifyEmailCode({ userId: pw, code: newCode })).toEqual({ ok: true });
    expect(await mustVerifyEmail(pw)).toBe(false);
  });

  it("never changes a verified or Google account's address", async () => {
    expect(await changeUnverifiedEmail({ userId: verified, email: `${P}x@test.local` })).toEqual({ ok: false, reason: "not_allowed" });
    expect(await changeUnverifiedEmail({ userId: google, email: `${P}y@test.local` })).toEqual({ ok: false, reason: "not_allowed" });
  });

  it("switched off again: nobody held", async () => {
    await setEmailVerificationRequired(admin, false);
    expect(await mustVerifyEmail(other)).toBe(false);
  });
});

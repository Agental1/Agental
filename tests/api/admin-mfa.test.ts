import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { totpCode, stepAt } from "@/domain/totp";

/**
 * Round 8d: the admin role requires a second factor. Without the proof
 * cookie, an admin gets nothing an admin gets; a good code sets it; a code
 * works once; failures are audited; guessing is rate limited.
 */
const P = "test-adminmfa-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

const session = vi.fn();
const jar = new Map<string, string>();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

const { submitAdminCode } = await import("@/app/actions/admin-mfa");
const { currentAdminId } = await import("@/lib/limelight/admin");
const { decryptSecret, encryptSecret, mfaProof, proofValid, adminMfaRequired, ADMIN_MFA_COOKIE } = await import("@/lib/admin-mfa");
const { isTeamMember } = await import("@/lib/messages");

describe("admin second factor, pure parts", () => {
  beforeAll(() => vi.stubEnv("AUTH_SECRET", "test-secret-for-admin-mfa-0123456789"));
  afterAll(() => vi.unstubAllEnvs());

  it("is required in production unless turned off, and on demand elsewhere", () => {
    expect(adminMfaRequired({ VERCEL_ENV: "production" })).toBe(true);
    expect(adminMfaRequired({ VERCEL_ENV: "production", ADMIN_MFA_REQUIRED: "false" })).toBe(false);
    expect(adminMfaRequired({ VERCEL_ENV: "preview" })).toBe(false);
    expect(adminMfaRequired({ NODE_ENV: "production" })).toBe(true);
    expect(adminMfaRequired({ ADMIN_MFA_REQUIRED: "true" })).toBe(true);
  });

  it("encrypts the secret and signs the proof", () => {
    expect(decryptSecret(encryptSecret("JBSWY3DPEHPK3PXP"))).toBe("JBSWY3DPEHPK3PXP");
    const now = new Date();
    const { value } = mfaProof("user-a", "enr-1", now);
    expect(proofValid(value, "user-a", "enr-1", now)).toBe(true);
    expect(proofValid(value, "user-b", "enr-1", now)).toBe(false);
    // A new enrollment voids earlier proofs.
    expect(proofValid(value, "user-a", "enr-2", now)).toBe(false);
    expect(proofValid(value, "user-a", "enr-1", new Date(now.getTime() + 13 * 3600_000))).toBe(false);
    expect(proofValid(value.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "user-a", "enr-1", now)).toBe(false);
    expect(proofValid(`user-a.${now.getTime() + 3600_000}.forged`, "user-a", "enr-1", now)).toBe(false);
  });
});

describe.skipIf(!local)("admin second factor against the database", () => {
  let admin = "";
  beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-for-admin-mfa-0123456789");
    vi.stubEnv("ADMIN_MFA_REQUIRED", "true");
    admin = (await prisma.user.create({ data: { email: `${P}admin@test.local`, kind: "TALENT", isAdmin: true } })).id;
  });
  afterAll(async () => {
    await prisma.rateLimitEvent.deleteMany({ where: { key: `admin-mfa:${admin}` } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: admin } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    jar.clear();
    session.mockResolvedValue({ user: { id: admin, kind: "TALENT" } });
  });

  it("an admin without the code is not an admin anywhere", async () => {
    expect(await currentAdminId()).toBeNull();
    expect(await isTeamMember(admin)).toBe(false);
  });

  it("enrolls with a good code, then opens the admin; a code works once", async () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    await prisma.adminTotp.create({ data: { userId: admin, secretEnc: encryptSecret(secret) } });

    expect(await submitAdminCode("000000")).toMatchObject({ ok: false, error: { key: "errors.adminCodeWrong" } });
    expect(await prisma.auditLog.count({ where: { actorUserId: admin, action: "admin.mfa.fail" } })).toBe(1);

    const code = totpCode(secret, stepAt(new Date()));
    expect(await submitAdminCode(code)).toEqual({ ok: true });
    expect(jar.has(ADMIN_MFA_COOKIE)).toBe(true);
    expect((await prisma.adminTotp.findUniqueOrThrow({ where: { userId: admin } })).verifiedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { actorUserId: admin, action: "admin.mfa.enroll" } })).toBe(1);
    expect(await currentAdminId()).toBe(admin);
    expect(await isTeamMember(admin)).toBe(true);

    // The same code again is refused.
    jar.clear();
    expect(await submitAdminCode(code)).toMatchObject({ ok: false });
    expect(await currentAdminId()).toBeNull();
  });

  it("a cookie made in the browser does not count", async () => {
    jar.set(ADMIN_MFA_COOKIE, `${admin}.${Date.now() + 3600_000}.forged`);
    expect(await currentAdminId()).toBeNull();
  });

  it("a signed proof stops counting once the enrollment is removed, and an admin without it reads no one's media", async () => {
    const { canReadMedia } = await import("@/lib/media-access");
    const owner = await prisma.user.create({
      data: { email: `${P}owner@test.local`, kind: "TALENT", artistProfile: { create: { stageName: "owner" } } },
      include: { artistProfile: true },
    });
    const profileId = owner.artistProfile!.id;
    expect(await canReadMedia(admin, profileId)).toBe(false);
    const enrollment = await prisma.adminTotp.findUniqueOrThrow({ where: { userId: admin } });
    jar.set(ADMIN_MFA_COOKIE, mfaProof(admin, enrollment.id).value);
    expect(await canReadMedia(admin, profileId)).toBe(true);
    await prisma.adminTotp.update({ where: { userId: admin }, data: { verifiedAt: null } });
    expect(await currentAdminId()).toBeNull();
    expect(await canReadMedia(admin, profileId)).toBe(false);
  });

  it("refuses a visitor and a non-admin", async () => {
    session.mockResolvedValueOnce(null);
    expect(await submitAdminCode("123456")).toMatchObject({ ok: false, error: { key: "errors.unauthorized" } });
    const other = await prisma.user.create({ data: { email: `${P}other@test.local`, kind: "TALENT" } });
    session.mockResolvedValueOnce({ user: { id: other.id, kind: "TALENT" } });
    expect(await submitAdminCode("123456")).toMatchObject({ ok: false, error: { key: "errors.forbidden" } });
    expect(jar.size).toBe(0);
  });

  it("guessing is rate limited", async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await submitAdminCode("111111");
    expect(last).toMatchObject({ ok: false, error: { key: "errors.tooManyAttempts" } });
  });
});

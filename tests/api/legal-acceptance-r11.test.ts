import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";

/**
 * Round 11.1, group 4: one box at sign-up (Privacy Policy and cookies), no
 * acceptance screen for signed-in people, Google sign-ups record the Privacy
 * acceptance, and the admin's filters and CSV, on the real local database.
 */
const P = "test-legal-r11-";
/** Accounts the tests create through sign-up, kept apart from the seeded ones the admin filters count. */
const S = "test-legal-r11s-";
const ip = `198.51.100.${randomInt(1, 254)}`;
const banner: { choice: { analytics: boolean; marketing: boolean } | null; written: unknown[] } = { choice: null, written: [] };
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": ip }) }));
vi.mock("@/auth", () => ({ signIn: async () => undefined, signOut: async () => undefined }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/consent", () => ({
  readConsentCookie: async () => banner.choice,
  writeConsentCookie: async (c: unknown) => void banner.written.push(c),
}));
vi.mock("@/lib/email-code", () => ({ sendEmailCode: async () => ({ ok: false }) }));

const { signupAction } = await import("@/app/actions/auth");
const { createOAuthUser } = await import("@/lib/auth/resolve-oauth-user");
const { PRIVACY_POLICY_VERSION } = await import("@/domain/legal-versions");
const { CONSENT_POLICY_VERSION } = await import("@/domain/consent");
const { abuseKeyHash } = await import("@/lib/rate-key");
const { listAccounts, accountFiltersFrom, accountsCsv } = await import("@/lib/admin/accounts");
const { listCookieChoices, cookieFiltersFrom, cookiesCsv } = await import("@/lib/admin/cookies");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const password = "Long-Test-Passphrase-r111!";
let older: string;
let google: string;
let accepted: string;

function form(address: string, box = true): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({ email: address, password, kind: "TALENT", locale: "en" })) f.set(k, v);
  if (box) f.set("privacy", "yes");
  return f;
}

describe.skipIf(!local)("Privacy Policy and cookies, one box (round 11.1)", () => {
  beforeAll(async () => {
    older = (await prisma.user.create({ data: { email: `${P}older@test.local`, passwordHash: "x", kind: "TALENT" } })).id;
    google = (await prisma.user.create({ data: { email: `${P}google@test.local`, passwordHash: null, kind: "TALENT", emailVerified: new Date(), privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_POLICY_VERSION } })).id;
    accepted = (
      await prisma.user.create({
        data: { email: `${P}accepted@test.local`, passwordHash: "x", kind: "CASTING", privacyAcceptedAt: new Date("2026-11-24T18:00:00Z"), privacyVersion: PRIVACY_POLICY_VERSION },
      })
    ).id;
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { OR: [{ email: { startsWith: P } }, { email: { startsWith: S } }] }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.rateLimitEvent.deleteMany({ where: { key: { in: [`signup:ip:${abuseKeyHash(ip)}`, `signup-created:ip:${abuseKeyHash(ip)}`] } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ resourceId: { in: ids } }, { actorUserId: { in: ids } }] } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("refuses a sign-up without the box, creating nothing", async () => {
    const email = `${S}nobox@test.local`;
    expect(await signupAction(undefined, form(email, false))).toEqual({ error: { key: "errors.privacyRequired" } });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("with the box and no banner choice: accepted-all cookies, the privacy version, and the browser cookie follows", async () => {
    const email = `${S}all@test.local`;
    banner.choice = null;
    banner.written = [];
    expect(await signupAction(undefined, form(email))).toBeUndefined();
    const u = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(u).toMatchObject({ consentAnalytics: true, consentMarketing: true, consentVersion: CONSENT_POLICY_VERSION, privacyVersion: PRIVACY_POLICY_VERSION });
    expect(u.consentAt).toBeInstanceOf(Date);
    expect(u.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(banner.written).toEqual([{ analytics: true, marketing: true }]);
  });

  it("with a prior Reject in the banner, the account keeps reject", async () => {
    const email = `${S}reject@test.local`;
    banner.choice = { analytics: false, marketing: false };
    banner.written = [];
    expect(await signupAction(undefined, form(email))).toBeUndefined();
    const u = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(u).toMatchObject({ consentAnalytics: false, consentMarketing: false, privacyVersion: PRIVACY_POLICY_VERSION });
    expect(u.consentAt).toBeInstanceOf(Date);
    expect(banner.written).toEqual([]);
  });

  it("a Google sign-up records the Privacy acceptance at creation", async () => {
    const res = await createOAuthUser(prisma, { provider: "google", providerAccountId: `${S}sub`, email: `${S}oauth@test.local`, emailAuthoritative: true, name: "G", image: null } as never, "TALENT", "en");
    expect(res.type).toBe("created");
    const u = await prisma.user.findFirstOrThrow({ where: { email: `${S}oauth@test.local` } });
    expect(u.privacyVersion).toBe(PRIVACY_POLICY_VERSION);
    expect(u.privacyAcceptedAt).toBeInstanceOf(Date);
  });

  it("no acceptance screen exists: layouts never block an account without acceptance", () => {
    for (const side of ["talents", "casting"]) {
      const src = readFileSync(`src/app/[locale]/${side}/(space)/layout.tsx`, "utf8");
      expect(src).not.toMatch(/AcceptPrivacyScreen|needsLegalAcceptance/);
    }
    expect(() => readFileSync("src/components/legal/accept-privacy.tsx")).toThrow();
  });

  it("filters accounts by acceptance and puts date and version in the CSV", async () => {
    await prisma.user.update({ where: { id: older }, data: { privacyAcceptedAt: null, privacyVersion: null } });
    const no = await listAccounts(accountFiltersFrom((k) => ({ privacy: "no", q: P })[k]));
    expect(no.map((r) => r.id)).toEqual([older]);
    const yes = await listAccounts(accountFiltersFrom((k) => ({ privacy: "yes", q: P })[k]));
    expect(yes.map((r) => r.id).sort()).toEqual([google, accepted].sort());
    const csv = accountsCsv(yes);
    expect(csv.split("\r\n")[0]).toContain("privacy_accepted_at,privacy_version");
    expect(csv).toContain(`2026-11-24T18:00:00.000Z,${PRIVACY_POLICY_VERSION}`);
  });

  it("Admin > Cookies: filters by acceptance and version, CSV columns", async () => {
    const mine = (rows: { email: string }[]) => rows.filter((r) => r.email.startsWith(P)).map((r) => r.email).sort();
    expect(mine(await listCookieChoices(cookieFiltersFrom((k) => ({ privacy: "no" })[k])))).toEqual([`${P}older@test.local`]);
    expect(mine(await listCookieChoices(cookieFiltersFrom((k) => ({ privacyVersion: PRIVACY_POLICY_VERSION })[k])))).toEqual(
      [`${P}accepted@test.local`, `${P}google@test.local`].sort()
    );
    const rows = (await listCookieChoices(cookieFiltersFrom((k) => ({ privacy: "yes" })[k]))).filter((r) => r.email.startsWith(P));
    const csv = cookiesCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("id,email,type,test,choice,analytics,marketing,chosen_at,policy_version,privacy_accepted_at,privacy_version");
    expect(csv).toContain(PRIVACY_POLICY_VERSION);
  });
});

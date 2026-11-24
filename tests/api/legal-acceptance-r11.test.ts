import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 11, group 3: the Privacy Policy accepted once at the next sign-in
 * (older accounts, Google sign-ups), and the admin's filters and CSV, on the
 * real local database.
 */
const P = "test-legal-r11-";
const session: { user: { id?: string } | null } = { user: null };
vi.mock("@/auth", () => ({ auth: async () => session }));

const { acceptLegalDocuments } = await import("@/app/actions/legal");
const { PRIVACY_POLICY_VERSION, TERMS_VERSION, needsLegalAcceptance } = await import("@/domain/legal-versions");
const { listAccounts, accountFiltersFrom, accountsCsv } = await import("@/lib/admin/accounts");
const { listCookieChoices, cookieFiltersFrom, cookiesCsv } = await import("@/lib/admin/cookies");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
let older: string;
let google: string;
let accepted: string;

describe.skipIf(!local)("Privacy Policy acceptance (round 11)", () => {
  beforeAll(async () => {
    older = (await prisma.user.create({ data: { email: `${P}older@test.local`, passwordHash: "x", kind: "TALENT" } })).id;
    google = (await prisma.user.create({ data: { email: `${P}google@test.local`, passwordHash: null, kind: "TALENT", emailVerified: new Date() } })).id;
    accepted = (
      await prisma.user.create({
        data: { email: `${P}accepted@test.local`, passwordHash: "x", kind: "CASTING", privacyAcceptedAt: new Date("2026-11-24T18:00:00Z"), privacyVersion: PRIVACY_POLICY_VERSION },
      })
    ).id;
  });
  afterAll(async () => {
    const ids = [older, google, accepted];
    await prisma.auditLog.deleteMany({ where: { OR: [{ resourceId: { in: ids } }, { actorUserId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("asks an account with no acceptance, or an older version, and not one on the current version", () => {
    const none = { privacyAcceptedAt: null, privacyVersion: null, termsAcceptedAt: null, termsVersion: null };
    expect(needsLegalAcceptance(none, false)).toBe(true);
    expect(needsLegalAcceptance({ ...none, privacyAcceptedAt: new Date(), privacyVersion: "2026-01-01" }, false)).toBe(true);
    const current = { ...none, privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_POLICY_VERSION };
    expect(needsLegalAcceptance(current, false)).toBe(false);
    // Once the Terms are published, they are asked too.
    expect(needsLegalAcceptance(current, true)).toBe(true);
    expect(needsLegalAcceptance({ ...current, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION }, true)).toBe(false);
  });

  it("refuses without a session or without the box", async () => {
    session.user = null;
    expect(await acceptLegalDocuments(true)).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
    session.user = { id: older };
    expect(await acceptLegalDocuments(false)).toEqual({ ok: false, error: { key: "errors.privacyRequired" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: older } })).privacyAcceptedAt).toBeNull();
  });

  it("records the date and version once ticked, audited, for a password and a Google account", async () => {
    for (const id of [older, google]) {
      session.user = { id };
      expect(await acceptLegalDocuments(true)).toEqual({ ok: true });
      const u = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(u.privacyVersion).toBe(PRIVACY_POLICY_VERSION);
      expect(u.privacyAcceptedAt).toBeInstanceOf(Date);
      expect(u.termsVersion).toBeNull();
      expect(needsLegalAcceptance(u, false)).toBe(false);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: id, action: "legal.accepted" } });
      expect(JSON.parse(String(log.after))).toMatchObject({ privacyVersion: PRIVACY_POLICY_VERSION, via: "prompt" });
    }
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

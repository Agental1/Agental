import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/** School-email verification against the real database, email captured. */
const P = "test-student-";
type Mail = { to: string; subject: string; text: string; html: string };
const sent: Mail[] = [];
vi.mock("@/lib/mailer", () => ({
  sendEmail: vi.fn(async (mail: Mail) => {
    sent.push(mail);
    return { ok: true as const, mode: "log" as const };
  }),
}));
const { requestStudentVerification, confirmStudentEmail } = await import("@/lib/student-email");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const tokenFrom = (m: Mail) => decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(m.text)![1]);
let a: string;
let b: string;
const school = `${P}${Date.now()}@usc.edu`;

describe.skipIf(!local)("college student discount by school email", () => {
  beforeAll(async () => {
    a = (await prisma.user.create({ data: { email: `${P}a@test.local`, name: "a", kind: "TALENT" } })).id;
    b = (await prisma.user.create({ data: { email: `${P}b@test.local`, name: "b", kind: "TALENT" } })).id;
  });
  afterAll(async () => {
    const ids = [a, b];
    await prisma.rateLimitEvent.deleteMany({ where: { key: { in: ids.map((id) => `student-email:${id}`) } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  const base = { locale: "en", baseUrl: "http://localhost:3200" };

  it("refuses an address that is not a school address", async () => {
    expect(await requestStudentVerification({ userId: a, email: "a@gmail.com", ...base })).toEqual({
      ok: false,
      reason: "not_school",
    });
  });

  it("sends a link, and the link verifies the account once", async () => {
    const res = await requestStudentVerification({ userId: a, email: school, ...base });
    expect(res.ok).toBe(true);
    const mail = sent.at(-1)!;
    expect(mail.to).toBe(school);
    const token = tokenFrom(mail);
    expect(await confirmStudentEmail(token)).toEqual({ ok: true, email: school });
    expect(await confirmStudentEmail(token)).toEqual({ ok: false, reason: "invalid" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: a } });
    expect(user.studentEmail).toBe(school);
    expect(user.studentVerifiedAt).not.toBeNull();
  });

  it("lets one school address verify one account only", async () => {
    expect(await requestStudentVerification({ userId: b, email: school, ...base })).toEqual({ ok: false, reason: "taken" });
  });

  it("expires links", async () => {
    const other = `${P}x${Date.now()}@ucla.edu`;
    const past = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    await requestStudentVerification({ userId: b, email: other, ...base, now: past });
    expect(await confirmStudentEmail(tokenFrom(sent.at(-1)!))).toEqual({ ok: false, reason: "expired" });
  });

  it("rate-limits sends", async () => {
    const results = [];
    for (let i = 0; i < 5; i++)
      results.push(await requestStudentVerification({ userId: b, email: `${P}r${i}@mit.edu`, ...base }));
    expect(results.some((r) => !r.ok && r.reason === "rate_limited")).toBe(true);
  });
});

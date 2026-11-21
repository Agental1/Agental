import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two student code actions with a mocked session, Prisma and rules
 * module. What is under test is what the actions own: who gets in, what the
 * rules module is handed, how its answer becomes an ActionError, what is
 * audited and what is revalidated. The rules themselves are covered in
 * tests/lib/student-code.test.ts.
 */

type SessionLike = { user?: { id?: string; kind?: string } } | null;

const state: { session: SessionLike } = { session: null };

const db = {
  user: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
};
const redeemCode = vi.fn();
const createCode = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/student-code", () => ({ redeemCode, createCode }));

const { redeemStudentCode, createStudentCode } = await import("@/app/actions/student");

const SECRET = "test-secret-with-enough-entropy";
const talent: SessionLike = { user: { id: "u1", kind: "TALENT" } };
const admin: SessionLike = { user: { id: "admin-1", kind: "CASTING" } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_SECRET", SECRET);
  state.session = null;
});

describe("redeemStudentCode", () => {
  it("refuses a visitor who is not signed in, without touching the rules", async () => {
    expect(await redeemStudentCode("482913")).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(redeemCode).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a session without a user id", async () => {
    state.session = { user: {} };
    expect(await redeemStudentCode("482913")).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(redeemCode).not.toHaveBeenCalled();
  });

  it("hands the session's user, the raw code and AUTH_SECRET to the rules", async () => {
    state.session = talent;
    redeemCode.mockResolvedValue({ ok: true, alreadyVerified: false });

    expect(await redeemStudentCode("482 913")).toEqual({ ok: true });
    expect(redeemCode).toHaveBeenCalledWith(db, {
      userId: "u1",
      code: "482 913",
      secret: SECRET,
    });
  });

  it("revalidates both subscription pages by route pattern", async () => {
    state.session = talent;
    redeemCode.mockResolvedValue({ ok: true, alreadyVerified: false });

    await redeemStudentCode("482913");
    expect(revalidatePath.mock.calls).toEqual([
      ["/[locale]/talents/(space)/app/abonnement", "page"],
      ["/[locale]/casting/(space)/app/abonnement", "page"],
    ]);
  });

  it("answers ok for a student who was already verified, without the internal flag", async () => {
    state.session = talent;
    redeemCode.mockResolvedValue({ ok: true, alreadyVerified: true });
    expect(await redeemStudentCode("482913")).toEqual({ ok: true });
  });

  it.each([
    "errors.studentCodeInvalid",
    "errors.studentCodeExpired",
    "errors.studentCodeUsedUp",
    "errors.tooManyAttempts",
  ] as const)("returns %s as a translation key and revalidates nothing", async (error) => {
    state.session = talent;
    redeemCode.mockResolvedValue({ ok: false, error });

    expect(await redeemStudentCode("482913")).toEqual({ ok: false, error: { key: error } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes an empty secret through when AUTH_SECRET is missing, for the rules to refuse", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    state.session = talent;
    redeemCode.mockRejectedValue(new Error("AUTH_SECRET is not set; cannot hash a student code."));

    await expect(redeemStudentCode("482913")).rejects.toThrow("AUTH_SECRET is not set");
    expect(redeemCode.mock.calls[0][1].secret).toBe("");
  });
});

describe("createStudentCode", () => {
  const asAdmin = () => {
    state.session = admin;
    db.user.findUnique.mockResolvedValue({ isAdmin: true });
    createCode.mockResolvedValue({ id: "code-9", code: "482913" });
  };

  it("refuses a visitor who is not signed in", async () => {
    expect(await createStudentCode({})).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(createCode).not.toHaveBeenCalled();
  });

  it.each([
    { label: "a user who is not an admin", row: { isAdmin: false } },
    { label: "a session whose account is gone", row: null },
  ])("refuses $label", async ({ row }) => {
    state.session = talent;
    db.user.findUnique.mockResolvedValue(row);

    expect(await createStudentCode({ label: "Sorbonne 2026" })).toEqual({
      ok: false,
      error: { key: "errors.forbidden" },
    });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { isAdmin: true, email: true },
    });
    expect(createCode).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("checks the admin flag before the input, so a stranger learns nothing about the form", async () => {
    state.session = talent;
    db.user.findUnique.mockResolvedValue({ isAdmin: false });
    expect(await createStudentCode({ maxUses: -1 })).toEqual({
      ok: false,
      error: { key: "errors.forbidden" },
    });
  });

  it("creates a code and returns it once, with its id", async () => {
    asAdmin();

    expect(
      await createStudentCode({
        label: "  Sorbonne 2026  ",
        expiresAt: "2099-06-30T12:00:00+02:00",
        maxUses: 200,
      })
    ).toEqual({ ok: true, id: "code-9", code: "482913" });

    expect(createCode).toHaveBeenCalledWith(db, {
      secret: SECRET,
      label: "Sorbonne 2026",
      expiresAt: new Date("2099-06-30T10:00:00Z"),
      maxUses: 200,
    });
  });

  it("audits the id and the label, never the code", async () => {
    asAdmin();
    await createStudentCode({ label: "Sorbonne 2026", maxUses: 200 });

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = (db.auditLog.create.mock.calls[0] as [{ data: Record<string, string> }])[0];
    expect(data).toMatchObject({
      actorUserId: "admin-1",
      action: "student.code.created",
      resourceType: "StudentCode",
      resourceId: "code-9",
    });
    expect(JSON.parse(data.after)).toEqual({ label: "Sorbonne 2026" });
    expect(JSON.stringify(data)).not.toContain("482913");
  });

  it("creates an open code when nothing is given: no label, no expiry, no cap", async () => {
    asAdmin();
    expect(await createStudentCode({})).toMatchObject({ ok: true });
    expect(createCode).toHaveBeenCalledWith(db, {
      secret: SECRET,
      label: undefined,
      expiresAt: null,
      maxUses: null,
    });
  });

  it("treats a blank label as no label", async () => {
    asAdmin();
    await createStudentCode({ label: "   " });
    expect(createCode.mock.calls[0][1].label).toBeUndefined();
  });

  it("reads a calendar day as the end of that day, UTC", async () => {
    asAdmin();
    await createStudentCode({ expiresAt: "2099-06-30" });
    expect(createCode.mock.calls[0][1].expiresAt).toEqual(
      new Date("2099-06-30T23:59:59.999Z")
    );
  });

  it.each([
    { label: "a label over 80 characters", input: { label: "x".repeat(81) } },
    { label: "a label that is not a string", input: { label: 42 } },
    { label: "zero uses", input: { maxUses: 0 } },
    { label: "a negative cap", input: { maxUses: -5 } },
    { label: "a fractional cap", input: { maxUses: 2.5 } },
    { label: "a cap over 100000", input: { maxUses: 100001 } },
    { label: "a cap sent as text", input: { maxUses: "30" } },
    { label: "an expiry in the past", input: { expiresAt: "2020-01-01T00:00:00Z" } },
    { label: "a calendar day in the past", input: { expiresAt: "2020-01-01" } },
    { label: "an expiry that is not a date", input: { expiresAt: "next month" } },
    { label: "a day that does not exist", input: { expiresAt: "2099-02-30" } },
    { label: "an instant without a zone", input: { expiresAt: "2099-06-30T12:00:00" } },
    { label: "an expiry sent as a number", input: { expiresAt: 4086000000000 } },
  ])("refuses $label", async ({ input }) => {
    asAdmin();

    expect(await createStudentCode(input as never)).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expect(createCode).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    { label: "80 characters", input: { label: "x".repeat(80) } },
    { label: "a cap of 1", input: { maxUses: 1 } },
    { label: "a cap of 100000", input: { maxUses: 100000 } },
  ])("accepts the boundary: $label", async ({ input }) => {
    asAdmin();
    expect(await createStudentCode(input)).toMatchObject({ ok: true });
  });

  it("refuses an expiry that is now or earlier, to the millisecond", async () => {
    asAdmin();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T10:00:00.000Z"));
    try {
      expect(await createStudentCode({ expiresAt: "2026-11-19T10:00:00.000Z" })).toEqual({
        ok: false,
        error: { key: "errors.invalidInput" },
      });
      expect(await createStudentCode({ expiresAt: "2026-11-19T10:00:00.001Z" })).toMatchObject({
        ok: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

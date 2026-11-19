import { describe, expect, it, vi } from "vitest";

/**
 * Student codes with a mocked Prisma. What is under test is the decision at
 * each step (already verified, rate limited, invalid, expired, used up,
 * redeemed) and what gets written. That the conditional UPDATE and the unique
 * pair hold under real concurrency is Postgres's part.
 */

// src/lib/audit.ts imports the real client for its default argument. Nothing
// here uses that default: every audit entry goes through the transaction.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const {
  STUDENT_CODE_ATTEMPTS,
  STUDENT_CODE_WINDOW_MS,
  createCode,
  generateStudentCode,
  hashStudentCode,
  listCodes,
  normalizeStudentCode,
  redeemCode,
} = await import("@/lib/student-code");

const SECRET = "test-secret-with-enough-entropy";
const CODE = "482913";
const now = new Date("2026-11-19T10:00:00Z");

describe("normalizeStudentCode", () => {
  it.each([
    ["482913", "482913"],
    ["482 913", "482913"],
    ["482-913", "482913"],
    [" 4 8 2 - 9 1 3 ", "482913"],
    ["000042", "000042"],
    ["482 913", "482913"],
  ])("accepts %j", (raw, expected) => {
    expect(normalizeStudentCode(raw)).toBe(expected);
  });

  it.each([
    ["48291"],
    ["4829134"],
    ["48291a"],
    ["482.913"],
    ["482_913"],
    [""],
    ["      "],
    // Digits, but not ASCII ones.
    ["٤٨٢٩١٣"],
    ["４８２９１３"],
    // Six digits followed by a wall of separators is not a code.
    [`482913${" ".repeat(100)}`],
  ])("refuses %j", (raw) => {
    expect(normalizeStudentCode(raw)).toBeNull();
  });

  it.each([[482913], [null], [undefined], [["482913"]], [{ code: "482913" }]])(
    "refuses a non-string (%j)",
    (raw) => {
      expect(normalizeStudentCode(raw)).toBeNull();
    }
  );
});

describe("hashStudentCode", () => {
  it("is stable and looks like a SHA-256 in hex", () => {
    const hash = hashStudentCode(CODE, SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashStudentCode(CODE, SECRET)).toBe(hash);
  });

  it("differs by code and by secret", () => {
    expect(hashStudentCode("482914", SECRET)).not.toBe(hashStudentCode(CODE, SECRET));
    expect(hashStudentCode(CODE, "another-secret")).not.toBe(hashStudentCode(CODE, SECRET));
  });

  it("is not the plain hash of the code, nor an HMAC keyed with the raw secret", async () => {
    const { createHash, createHmac } = await import("node:crypto");
    const hash = hashStudentCode(CODE, SECRET);
    expect(hash).not.toBe(createHash("sha256").update(CODE).digest("hex"));
    expect(hash).not.toBe(createHmac("sha256", SECRET).update(CODE).digest("hex"));
  });

  it("throws a clear error on an empty secret", () => {
    expect(() => hashStudentCode(CODE, "")).toThrow("AUTH_SECRET is not set");
    expect(() => hashStudentCode(CODE, undefined as unknown as string)).toThrow(
      "AUTH_SECRET is not set"
    );
  });
});

describe("generateStudentCode", () => {
  it("always gives six digits that pass normalization unchanged", () => {
    const codes = Array.from({ length: 2000 }, () => generateStudentCode());
    for (const code of codes) {
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(normalizeStudentCode(code)).toBe(code);
    }
    // One draw in ten is below 100000 and needs its leading zero. Two
    // thousand draws without a single one would mean the padding is gone.
    expect(codes.some((code) => code.startsWith("0"))).toBe(true);
    // And they are not all the same.
    expect(new Set(codes).size).toBeGreaterThan(1900);
  });
});

type CodeRow = {
  id: string;
  label: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
};

const codeRow = (over: Partial<CodeRow> = {}): CodeRow => ({
  id: "code-1",
  label: "Sorbonne 2026",
  expiresAt: null,
  maxUses: null,
  ...over,
});

function mockDb(opts: {
  /** undefined: verified never. null user: the account is gone. */
  user?: { studentVerifiedAt: Date | null } | null;
  code?: CodeRow | null;
  /** Attempts already counted inside the window. */
  attempts?: number;
  redemptionError?: unknown;
  claimed?: number;
} = {}) {
  const tx = {
    studentCodeRedemption: {
      create: vi.fn(async () => {
        if (opts.redemptionError) throw opts.redemptionError;
        return { id: "red-1" };
      }),
    },
    studentCode: { updateMany: vi.fn(async () => ({ count: opts.claimed ?? 1 })) },
    user: { update: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = {
    user: {
      findUnique: vi.fn(async () =>
        opts.user === undefined ? { studentVerifiedAt: null } : opts.user
      ),
    },
    studentCode: {
      findUnique: vi.fn(async () => (opts.code === undefined ? codeRow() : opts.code)),
    },
    rateLimitEvent: {
      findMany: vi.fn(async () =>
        Array.from({ length: opts.attempts ?? 0 }, () => ({
          createdAt: new Date(now.getTime() - 60_000),
        }))
      ),
      create: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, raw: db, tx };
}

const input = (code: unknown = CODE) => ({ userId: "u1", code, secret: SECRET, now });

function expectNothingRedeemed(tx: ReturnType<typeof mockDb>["tx"]) {
  expect(tx.user.update).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
}

describe("redeemCode", () => {
  it("redeems a valid code: redemption, one use, the stamp and the audit entry in one transaction", async () => {
    const { db, raw, tx } = mockDb();

    expect(await redeemCode(db, input())).toEqual({ ok: true, alreadyVerified: false });

    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.studentCodeRedemption.create).toHaveBeenCalledWith({
      data: { codeId: "code-1", userId: "u1" },
    });
    expect(tx.studentCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code-1" },
      data: { uses: { increment: 1 } },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { studentVerifiedAt: now },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = (tx.auditLog.create.mock.calls[0] as unknown as [
      { data: Record<string, string> },
    ])[0].data;
    expect(audit).toMatchObject({
      actorUserId: "u1",
      action: "student.code.redeemed",
      resourceType: "StudentCode",
      resourceId: "code-1",
    });
    expect(JSON.parse(audit.after)).toEqual({ label: "Sorbonne 2026" });
  });

  it("writes the redemption before claiming the use, so a double submit stops at the unique pair", async () => {
    const { db, tx } = mockDb();
    await redeemCode(db, input());
    expect(tx.studentCodeRedemption.create.mock.invocationCallOrder[0]).toBeLessThan(
      tx.studentCode.updateMany.mock.invocationCallOrder[0]
    );
  });

  it("looks the code up by its hash, after normalizing what was typed", async () => {
    const { db, raw } = mockDb();
    await redeemCode(db, input(" 482-913 "));
    expect(raw.studentCode.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codeHash: hashStudentCode(CODE, SECRET) } })
    );
  });

  it("never writes the code or its hash: not in the audit entry, not anywhere", async () => {
    const { db, raw, tx } = mockDb();
    await redeemCode(db, input());

    const written = JSON.stringify([
      tx.studentCodeRedemption.create.mock.calls,
      tx.studentCode.updateMany.mock.calls,
      tx.user.update.mock.calls,
      tx.auditLog.create.mock.calls,
      raw.rateLimitEvent.create.mock.calls,
    ]);
    expect(written).not.toContain(CODE);
    expect(written).not.toContain(hashStudentCode(CODE, SECRET));
    // Guards the guard: the audit entry is in there.
    expect(written).toContain("student.code.redeemed");
  });

  it("answers ok for a verified student and counts nothing", async () => {
    const { db, raw } = mockDb({
      user: { studentVerifiedAt: new Date("2026-10-01T08:00:00Z") },
    });

    // Even with a wrong code: there is nothing left to verify.
    expect(await redeemCode(db, input("000000"))).toEqual({ ok: true, alreadyVerified: true });

    expect(raw.rateLimitEvent.findMany).not.toHaveBeenCalled();
    expect(raw.rateLimitEvent.create).not.toHaveBeenCalled();
    expect(raw.studentCode.findUnique).not.toHaveBeenCalled();
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("refuses once the hourly attempts are spent, before looking at the code", async () => {
    const { db, raw } = mockDb({ attempts: STUDENT_CODE_ATTEMPTS });

    // A valid code, refused all the same.
    expect(await redeemCode(db, input())).toEqual({
      ok: false,
      error: "errors.tooManyAttempts",
    });
    expect(raw.rateLimitEvent.create).not.toHaveBeenCalled();
    expect(raw.studentCode.findUnique).not.toHaveBeenCalled();
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("limits per user: five attempts in a one hour window", async () => {
    const { db, raw } = mockDb({ attempts: STUDENT_CODE_ATTEMPTS - 1 });
    await redeemCode(db, input());

    expect(STUDENT_CODE_ATTEMPTS).toBe(5);
    expect(STUDENT_CODE_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(raw.rateLimitEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: "student-code:u1",
          createdAt: { gt: new Date(now.getTime() - STUDENT_CODE_WINDOW_MS) },
        },
        take: 5,
      })
    );
    expect(raw.rateLimitEvent.create).toHaveBeenCalledWith({
      data: { key: "student-code:u1", createdAt: now },
    });
  });

  it.each([
    { label: "a malformed code", code: "12345", row: undefined },
    { label: "a non-string", code: { $gt: "" }, row: undefined },
    { label: "an unknown code", code: "111111", row: null },
    { label: "an expired code", code: CODE, row: codeRow({ expiresAt: new Date(0) }) },
    { label: "a valid code", code: CODE, row: undefined },
  ])("counts the attempt for $label", async ({ code, row }) => {
    const { db, raw } = mockDb({ code: row });
    await redeemCode(db, input(code));
    expect(raw.rateLimitEvent.create).toHaveBeenCalledTimes(1);
  });

  it("answers invalid for a malformed code without a lookup", async () => {
    const { db, raw } = mockDb();
    expect(await redeemCode(db, input("12 34"))).toEqual({
      ok: false,
      error: "errors.studentCodeInvalid",
    });
    expect(raw.studentCode.findUnique).not.toHaveBeenCalled();
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("answers invalid for a code that does not exist", async () => {
    const { db, raw } = mockDb({ code: null });
    expect(await redeemCode(db, input())).toEqual({
      ok: false,
      error: "errors.studentCodeInvalid",
    });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { label: "long ago", expiresAt: new Date("2026-01-01T00:00:00Z") },
    { label: "this very instant", expiresAt: now },
  ])("answers expired for a code that expired $label", async ({ expiresAt }) => {
    const { db, raw } = mockDb({ code: codeRow({ expiresAt }) });
    expect(await redeemCode(db, input())).toEqual({
      ok: false,
      error: "errors.studentCodeExpired",
    });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("redeems a code that expires later", async () => {
    const { db } = mockDb({
      code: codeRow({ expiresAt: new Date(now.getTime() + 1) }),
    });
    expect(await redeemCode(db, input())).toEqual({ ok: true, alreadyVerified: false });
  });

  it("claims a capped code only while uses are below the cap", async () => {
    const { db, tx } = mockDb({ code: codeRow({ maxUses: 30 }) });
    expect(await redeemCode(db, input())).toEqual({ ok: true, alreadyVerified: false });
    expect(tx.studentCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code-1", uses: { lt: 30 } },
      data: { uses: { increment: 1 } },
    });
  });

  it("answers used up when the cap is reached, and rolls the redemption back", async () => {
    const { db, raw, tx } = mockDb({ code: codeRow({ maxUses: 30 }), claimed: 0 });

    expect(await redeemCode(db, input())).toEqual({
      ok: false,
      error: "errors.studentCodeUsedUp",
    });
    // The callback threw, which is what makes Prisma roll back the redemption
    // row written a statement earlier.
    await expect(raw.$transaction.mock.results[0].value).rejects.toThrow();
    expectNothingRedeemed(tx);
  });

  it("treats a double submit (P2002 on the pair) as already verified", async () => {
    const { db, tx } = mockDb({ redemptionError: { code: "P2002" } });

    expect(await redeemCode(db, input())).toEqual({ ok: true, alreadyVerified: true });
    // The second request claimed no use and wrote no second audit entry.
    expect(tx.studentCode.updateMany).not.toHaveBeenCalled();
    expectNothingRedeemed(tx);
  });

  it("answers invalid, uncounted, when the account no longer exists", async () => {
    const { db, raw } = mockDb({ user: null });
    expect(await redeemCode(db, input())).toEqual({
      ok: false,
      error: "errors.studentCodeInvalid",
    });
    expect(raw.rateLimitEvent.create).not.toHaveBeenCalled();
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("rethrows other database errors", async () => {
    const { db } = mockDb({ redemptionError: new Error("connection lost") });
    await expect(redeemCode(db, input())).rejects.toThrow("connection lost");
  });

  it("lets a failed stamp escape the transaction, so the redemption is not kept", async () => {
    const { db, tx } = mockDb();
    tx.user.update.mockRejectedValueOnce(new Error("connection reset"));
    await expect(redeemCode(db, input())).rejects.toThrow("connection reset");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses to run without the secret, before counting an attempt", async () => {
    const { db, raw } = mockDb();
    await expect(redeemCode(db, { ...input(), secret: "" })).rejects.toThrow(
      "AUTH_SECRET is not set"
    );
    expect(raw.user.findUnique).not.toHaveBeenCalled();
    expect(raw.rateLimitEvent.create).not.toHaveBeenCalled();
  });
});

function codeDb(createImpl?: (args: { data: Record<string, unknown> }) => unknown) {
  const studentCode = {
    create: vi.fn(
      async (args: { data: Record<string, unknown> }) =>
        (createImpl ? createImpl(args) : { id: "code-9" }) as { id: string }
    ),
    findMany: vi.fn(async () => [] as unknown[]),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { studentCode } as any, studentCode };
}

describe("createCode", () => {
  it("returns the plain code once and stores only its hash", async () => {
    const { db, studentCode } = codeDb();
    const expiresAt = new Date("2027-06-30T23:59:59Z");

    const created = await createCode(db, {
      secret: SECRET,
      label: "  Sorbonne 2026 ",
      expiresAt,
      maxUses: 200,
    });

    expect(created.id).toBe("code-9");
    expect(created.code).toMatch(/^[0-9]{6}$/);
    expect(studentCode.create).toHaveBeenCalledWith({
      data: {
        codeHash: hashStudentCode(created.code, SECRET),
        label: "Sorbonne 2026",
        expiresAt,
        maxUses: 200,
      },
      select: { id: true },
    });
    expect(JSON.stringify(studentCode.create.mock.calls)).not.toContain(created.code);
  });

  it("defaults to no label, no expiry and no cap", async () => {
    const { db, studentCode } = codeDb();
    await createCode(db, { secret: SECRET });
    expect(studentCode.create.mock.calls[0][0].data).toMatchObject({
      label: null,
      expiresAt: null,
      maxUses: null,
    });
  });

  it("draws another code when the hash is taken", async () => {
    let calls = 0;
    const { db, studentCode } = codeDb(() => {
      calls += 1;
      if (calls < 3) throw { code: "P2002" };
      return { id: "code-9" };
    });

    const created = await createCode(db, { secret: SECRET });

    expect(studentCode.create).toHaveBeenCalledTimes(3);
    // The code handed back is the one that was stored, not an earlier draw.
    expect(studentCode.create.mock.calls[2][0].data.codeHash).toBe(
      hashStudentCode(created.code, SECRET)
    );
  });

  it("gives up after a few collisions instead of looping", async () => {
    const { db, studentCode } = codeDb(() => {
      throw { code: "P2002" };
    });
    await expect(createCode(db, { secret: SECRET })).rejects.toThrow(
      "Could not draw an unused student code"
    );
    expect(studentCode.create).toHaveBeenCalledTimes(5);
  });

  it("rethrows other database errors without retrying", async () => {
    const { db, studentCode } = codeDb(() => {
      throw new Error("connection lost");
    });
    await expect(createCode(db, { secret: SECRET })).rejects.toThrow("connection lost");
    expect(studentCode.create).toHaveBeenCalledTimes(1);
  });

  it("refuses to run without the secret", async () => {
    const { db, studentCode } = codeDb();
    await expect(createCode(db, { secret: "" })).rejects.toThrow("AUTH_SECRET is not set");
    expect(studentCode.create).not.toHaveBeenCalled();
  });
});

describe("listCodes", () => {
  it("selects the public columns only, newest first", async () => {
    const { db, studentCode } = codeDb();
    const rows = [
      {
        id: "code-1",
        label: "Sorbonne 2026",
        expiresAt: null,
        maxUses: 30,
        uses: 4,
        createdAt: now,
      },
    ];
    studentCode.findMany.mockResolvedValueOnce(rows);

    expect(await listCodes(db)).toEqual(rows);
    expect(studentCode.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        label: true,
        expiresAt: true,
        maxUses: true,
        uses: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });
});

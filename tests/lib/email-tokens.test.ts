import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  RESET_PATH_SEGMENT,
  RESET_TTL_MS,
  TOKEN_QUERY_PARAM,
  VERIFY_PATH_SEGMENT,
  VERIFY_TTL_MS,
  consumeEmailToken,
  createEmailToken,
  hashEmailToken,
  linkFor,
  revokeEmailTokens,
  siteBaseUrl,
} from "@/lib/email-tokens";

/**
 * Email tokens against an in-memory stand-in for the VerificationToken table.
 * The stand-in understands only the filters the module sends (identifier,
 * token), which is enough to exercise the rules: what is stored, what a token
 * is worth, and that it is worth it once.
 */

type Row = { identifier: string; token: string; expires: Date };
type Where = { identifier?: string; token?: string };

const matches = (row: Row, where: Where) =>
  (where.identifier === undefined || row.identifier === where.identifier) &&
  (where.token === undefined || row.token === where.token);

function fakeDb(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  const verificationToken = {
    findFirst: vi.fn(async (args: { where: Where }) => {
      const row = rows.find((r) => matches(r, args.where));
      return row ? { identifier: row.identifier, expires: row.expires } : null;
    }),
    create: vi.fn(async (args: { data: Row }) => {
      rows.push({ ...args.data });
      return args.data;
    }),
    deleteMany: vi.fn(async (args: { where: Where }) => {
      const kept = rows.filter((r) => !matches(r, args.where));
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { count };
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { verificationToken } as any, rows, verificationToken };
}

const now = new Date("2026-11-19T10:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

describe("the constants", () => {
  it("gives a confirmation link 24 hours and a reset link one hour", () => {
    expect(VERIFY_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(RESET_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("names the two pages and the query parameter", () => {
    expect(VERIFY_PATH_SEGMENT).toBe("verifier");
    expect(RESET_PATH_SEGMENT).toBe("reinitialiser");
    expect(TOKEN_QUERY_PARAM).toBe("token");
  });
});

describe("hashEmailToken", () => {
  it("is the SHA-256 of the token, in hex", () => {
    expect(hashEmailToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
    expect(hashEmailToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEmailToken("abd")).not.toBe(hashEmailToken("abc"));
  });
});

describe("createEmailToken", () => {
  it("returns 32 random bytes in base64url", async () => {
    const { db } = fakeDb();
    const tokens = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        createEmailToken(db, { purpose: "verify", userId: `u${i}`, ttlMs: VERIFY_TTL_MS, now })
      )
    );
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
    expect(new Set(tokens).size).toBe(50);
  });

  it("stores the hash, the identifier and the expiry, and never the token", async () => {
    const { db, rows, verificationToken } = fakeDb();

    const token = await createEmailToken(db, {
      purpose: "reset",
      userId: "user-1",
      ttlMs: RESET_TTL_MS,
      now,
    });

    expect(rows).toEqual([
      {
        identifier: "reset:user-1",
        token: hashEmailToken(token),
        expires: later(RESET_TTL_MS),
      },
    ]);
    const written = JSON.stringify([
      verificationToken.create.mock.calls,
      verificationToken.deleteMany.mock.calls,
    ]);
    expect(written).not.toContain(token);
    // Guards the guard: the hash is in there.
    expect(written).toContain(hashEmailToken(token));
  });

  it("deletes the older tokens of the same purpose and user first", async () => {
    const { db, rows, verificationToken } = fakeDb();
    const first = await createEmailToken(db, { purpose: "verify", userId: "user-1", ttlMs: VERIFY_TTL_MS, now });
    const second = await createEmailToken(db, { purpose: "verify", userId: "user-1", ttlMs: VERIFY_TTL_MS, now });

    expect(rows.map((r) => r.token)).toEqual([hashEmailToken(second)]);
    expect(verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "verify:user-1" },
    });
    expect(verificationToken.deleteMany.mock.invocationCallOrder[1]).toBeLessThan(
      verificationToken.create.mock.invocationCallOrder[1]
    );
    // One link works at a time: the first email's link is dead.
    expect(await consumeEmailToken(db, { purpose: "verify", token: first, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await consumeEmailToken(db, { purpose: "verify", token: second, now })).toEqual({
      ok: true,
      userId: "user-1",
    });
  });

  it("leaves the other purpose and other users alone", async () => {
    const { db, rows } = fakeDb();
    await createEmailToken(db, { purpose: "verify", userId: "user-1", ttlMs: VERIFY_TTL_MS, now });
    await createEmailToken(db, { purpose: "reset", userId: "user-1", ttlMs: RESET_TTL_MS, now });
    await createEmailToken(db, { purpose: "verify", userId: "user-2", ttlMs: VERIFY_TTL_MS, now });
    await createEmailToken(db, { purpose: "verify", userId: "user-1", ttlMs: VERIFY_TTL_MS, now });

    expect(rows.map((r) => r.identifier).sort()).toEqual([
      "reset:user-1",
      "verify:user-1",
      "verify:user-2",
    ]);
  });

  it("uses the current time when none is given", async () => {
    const { db, rows } = fakeDb();
    const before = Date.now();
    await createEmailToken(db, { purpose: "reset", userId: "user-1", ttlMs: RESET_TTL_MS });
    const after = Date.now();
    expect(rows[0].expires.getTime()).toBeGreaterThanOrEqual(before + RESET_TTL_MS);
    expect(rows[0].expires.getTime()).toBeLessThanOrEqual(after + RESET_TTL_MS);
  });

  it.each([
    { label: "an empty user id", input: { userId: "", ttlMs: 1000 } },
    { label: "a zero lifetime", input: { userId: "user-1", ttlMs: 0 } },
    { label: "a negative lifetime", input: { userId: "user-1", ttlMs: -1 } },
    { label: "a lifetime that is not a number", input: { userId: "user-1", ttlMs: Number.NaN } },
  ])("refuses $label and writes nothing", async ({ input }) => {
    const { db, verificationToken } = fakeDb();
    await expect(createEmailToken(db, { purpose: "verify", now, ...input })).rejects.toThrow(
      "createEmailToken needs"
    );
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(verificationToken.create).not.toHaveBeenCalled();
  });
});

describe("consumeEmailToken", () => {
  async function issued(purpose: "verify" | "reset" = "verify", ttlMs = VERIFY_TTL_MS) {
    const fake = fakeDb();
    const token = await createEmailToken(fake.db, { purpose, userId: "user-1", ttlMs, now });
    vi.clearAllMocks();
    return { ...fake, token };
  }

  it("answers with the user id and deletes the row", async () => {
    const { db, rows, verificationToken, token } = await issued();

    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toEqual({
      ok: true,
      userId: "user-1",
    });
    expect(rows).toEqual([]);
    expect(verificationToken.findFirst).toHaveBeenCalledWith({
      where: { token: hashEmailToken(token) },
      select: { identifier: true, expires: true },
    });
    expect(verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "verify:user-1", token: hashEmailToken(token) },
    });
  });

  it("looks the token up by its hash and never sends the token itself", async () => {
    const { db, verificationToken, token } = await issued();
    await consumeEmailToken(db, { purpose: "verify", token, now });

    const sent = JSON.stringify([
      verificationToken.findFirst.mock.calls,
      verificationToken.deleteMany.mock.calls,
    ]);
    expect(sent).not.toContain(token);
    expect(sent).toContain(hashEmailToken(token));
  });

  it("works once", async () => {
    const { db, token } = await issued();
    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toMatchObject({ ok: true });
    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("lets one of two concurrent uses win: a delete that removed nothing is invalid", async () => {
    const { db, verificationToken, token } = await issued();
    // Both requests read the row before either deletes it.
    const row = { identifier: "verify:user-1", expires: later(VERIFY_TTL_MS) };
    verificationToken.findFirst.mockResolvedValue(row);

    const results = await Promise.all([
      consumeEmailToken(db, { purpose: "verify", token, now }),
      consumeEmailToken(db, { purpose: "verify", token, now }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "invalid" }]);
  });

  it.each([
    { label: "one millisecond before the expiry", offset: -1, expected: { ok: true, userId: "user-1" } },
    { label: "at the expiry, to the millisecond", offset: 0, expected: { ok: false, reason: "expired" } },
    { label: "a day after the expiry", offset: 24 * 60 * 60 * 1000, expected: { ok: false, reason: "expired" } },
  ])("answers for a token used $label", async ({ offset, expected }) => {
    const { db, token } = await issued("reset", RESET_TTL_MS);
    expect(
      await consumeEmailToken(db, { purpose: "reset", token, now: later(RESET_TTL_MS + offset) })
    ).toEqual(expected);
  });

  it("deletes an expired token too, so it answers invalid afterwards", async () => {
    const { db, rows, token } = await issued("reset", RESET_TTL_MS);
    const tooLate = later(RESET_TTL_MS + 1);

    expect(await consumeEmailToken(db, { purpose: "reset", token, now: tooLate })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(rows).toEqual([]);
    expect(await consumeEmailToken(db, { purpose: "reset", token, now: tooLate })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses a confirmation token on the reset side, and leaves it usable", async () => {
    const { db, rows, verificationToken, token } = await issued("verify");

    expect(await consumeEmailToken(db, { purpose: "reset", token, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toEqual({
      ok: true,
      userId: "user-1",
    });
  });

  it("refuses a reset token on the confirmation side", async () => {
    const { db, rows, token } = await issued("reset", RESET_TTL_MS);
    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(rows).toHaveLength(1);
  });

  it("answers invalid for a well-formed token nobody issued", async () => {
    const { db, rows, verificationToken } = await issued();
    const stranger = Buffer.alloc(32, 7).toString("base64url");

    expect(await consumeEmailToken(db, { purpose: "verify", token: stranger, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it.each([
    { label: "an empty string", token: "" },
    { label: "a short string", token: "short" },
    { label: "42 characters", token: "x".repeat(42) },
    { label: "44 characters", token: "x".repeat(44) },
    { label: "base64 padding", token: `${"x".repeat(42)}=` },
    { label: "a character outside base64url", token: `${"x".repeat(42)}+` },
    { label: "a leading space", token: ` ${"x".repeat(43)}` },
    { label: "a very long string", token: "x".repeat(100_000) },
    { label: "null", token: null },
    { label: "undefined", token: undefined },
    { label: "a number", token: 12345 },
    { label: "an array", token: ["x".repeat(43)] },
    { label: "an object", token: { $gt: "" } },
  ])("answers invalid for $label without a query", async ({ token }) => {
    const { db, verificationToken } = fakeDb();
    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(verificationToken.findFirst).not.toHaveBeenCalled();
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
  });

  it("answers invalid for a row whose identifier names no user", async () => {
    const token = Buffer.alloc(32, 9).toString("base64url");
    const { db } = fakeDb([
      { identifier: "verify:", token: hashEmailToken(token), expires: later(1000) },
    ]);
    expect(await consumeEmailToken(db, { purpose: "verify", token, now })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("keeps a user id that itself contains a colon", async () => {
    const token = Buffer.alloc(32, 3).toString("base64url");
    const { db } = fakeDb([
      { identifier: "reset:tenant:42", token: hashEmailToken(token), expires: later(1000) },
    ]);
    expect(await consumeEmailToken(db, { purpose: "reset", token, now })).toEqual({
      ok: true,
      userId: "tenant:42",
    });
  });
});

describe("revokeEmailTokens", () => {
  it("deletes the pending tokens of one purpose for one user", async () => {
    const { db, rows } = fakeDb();
    await createEmailToken(db, { purpose: "reset", userId: "user-1", ttlMs: RESET_TTL_MS, now });
    await createEmailToken(db, { purpose: "verify", userId: "user-1", ttlMs: VERIFY_TTL_MS, now });
    await createEmailToken(db, { purpose: "reset", userId: "user-2", ttlMs: RESET_TTL_MS, now });

    await revokeEmailTokens(db, { purpose: "reset", userId: "user-1" });

    expect(rows.map((r) => r.identifier).sort()).toEqual(["reset:user-2", "verify:user-1"]);
  });
});

describe("linkFor", () => {
  const token = "AbC-_123";

  it("builds the confirmation link", () => {
    expect(linkFor("verify", token, "fr", "https://www.agental.test")).toBe(
      "https://www.agental.test/fr/verifier?token=AbC-_123"
    );
  });

  it("builds the reset link", () => {
    expect(linkFor("reset", token, "zh", "https://www.agental.test")).toBe(
      "https://www.agental.test/zh/reinitialiser?token=AbC-_123"
    );
  });

  it.each(["en", "fr", "es", "zh"])("keeps the locale %s", (locale) => {
    expect(linkFor("verify", token, locale, "https://www.agental.test")).toContain(
      `/${locale}/verifier?`
    );
  });

  it.each(["de", "", "FR", "../admin", "fr/../.."])(
    "falls back to the default locale for %j",
    (locale) => {
      expect(linkFor("reset", token, locale, "https://www.agental.test")).toBe(
        "https://www.agental.test/en/reinitialiser?token=AbC-_123"
      );
    }
  );

  it("URL-encodes the token", () => {
    expect(linkFor("verify", "a b&c=d/e?f#g", "en", "https://www.agental.test")).toBe(
      "https://www.agental.test/en/verifier?token=a%20b%26c%3Dd%2Fe%3Ff%23g"
    );
  });

  it("gives a link that carries a real token back unchanged", async () => {
    const { db } = fakeDb();
    const real = await createEmailToken(db, { purpose: "verify", userId: "user-1", ttlMs: VERIFY_TTL_MS, now });
    const link = new URL(linkFor("verify", real, "es", "http://localhost:3000"));
    expect(link.pathname).toBe("/es/verifier");
    expect(link.searchParams.get("token")).toBe(real);
  });

  it("drops trailing slashes from the base", () => {
    expect(linkFor("verify", token, "en", "https://www.agental.test///")).toBe(
      "https://www.agental.test/en/verifier?token=AbC-_123"
    );
  });
});

describe("siteBaseUrl", () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  });
  const request = headers({ host: "preview-abc.agental.test", "x-forwarded-proto": "https" });

  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    expect(
      siteBaseUrl(
        { NEXT_PUBLIC_SITE_URL: "https://www.agental.test", AUTH_URL: "https://auth.agental.test" },
        request
      )
    ).toBe("https://www.agental.test");
  });

  it("falls back to AUTH_URL", () => {
    expect(siteBaseUrl({ AUTH_URL: "https://auth.agental.test" }, request)).toBe(
      "https://auth.agental.test"
    );
    expect(
      siteBaseUrl({ NEXT_PUBLIC_SITE_URL: "  ", AUTH_URL: "https://auth.agental.test" }, request)
    ).toBe("https://auth.agental.test");
  });

  it.each([
    ["https://www.agental.test/", "https://www.agental.test"],
    ["https://www.agental.test///", "https://www.agental.test"],
    [" https://www.agental.test ", "https://www.agental.test"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["https://www.agental.test/app/", "https://www.agental.test/app"],
    ["https://www.agental.test/?utm=1#top", "https://www.agental.test"],
  ])("normalizes %j to %j, with no trailing slash", (value, expected) => {
    expect(siteBaseUrl({ NEXT_PUBLIC_SITE_URL: value })).toBe(expected);
  });

  it("builds the origin from the request when no variable is set", () => {
    expect(siteBaseUrl({}, request)).toBe("https://preview-abc.agental.test");
    expect(
      siteBaseUrl({}, headers({ host: "localhost:3000", "x-forwarded-proto": "http" }))
    ).toBe("http://localhost:3000");
  });

  it("reads the first hop of x-forwarded-proto", () => {
    expect(
      siteBaseUrl({}, headers({ host: "preview-abc.agental.test", "x-forwarded-proto": "https, http" }))
    ).toBe("https://preview-abc.agental.test");
  });

  it("assumes https when the protocol header is missing or odd, http for a local host", () => {
    expect(siteBaseUrl({}, headers({ host: "preview-abc.agental.test" }))).toBe(
      "https://preview-abc.agental.test"
    );
    expect(
      siteBaseUrl({}, headers({ host: "preview-abc.agental.test", "x-forwarded-proto": "javascript" }))
    ).toBe("https://preview-abc.agental.test");
    expect(siteBaseUrl({}, headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(siteBaseUrl({}, headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
  });

  it.each([
    "evil.test/path",
    "evil.test@www.agental.test",
    "evil.test?x=",
    "evil.test#",
    "a b.test",
    "<script>",
    "",
  ])("refuses to build a link from the host %j", (host) => {
    expect(() => siteBaseUrl({}, headers({ host, "x-forwarded-proto": "https" }))).toThrow(
      "The site URL is unknown"
    );
  });

  it("throws a clear error when nothing is available", () => {
    expect(() => siteBaseUrl({})).toThrow(
      "The site URL is unknown: set NEXT_PUBLIC_SITE_URL or AUTH_URL"
    );
    expect(() => siteBaseUrl({}, null)).toThrow("The site URL is unknown");
    expect(() => siteBaseUrl({ NEXT_PUBLIC_SITE_URL: "", AUTH_URL: "" }, headers({}))).toThrow(
      "The site URL is unknown"
    );
  });

  it.each([
    ["NEXT_PUBLIC_SITE_URL", "www.agental.test"],
    ["NEXT_PUBLIC_SITE_URL", "ftp://www.agental.test"],
    ["AUTH_URL", "javascript:alert(1)"],
  ])("throws when %s is set to %j, naming the variable and not the value", (name, value) => {
    let message = "";
    try {
      siteBaseUrl({ [name]: value }, request);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(name);
    expect(message).not.toContain(value);
  });
});

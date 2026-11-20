import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/share/<token> with a mocked database and a fake object store. The
 * real rate limiter runs against an in-memory table. What is under test:
 * every refusal is the same 404, a working link is counted and redirected to
 * a signed address, every answer carries the three privacy headers, and
 * neither the token nor the client address is stored or logged.
 */

type EventRow = { key: string; createdAt: Date };
type EventWhere = { key: string; createdAt: { gt?: Date; lte?: Date } };

const events: EventRow[] = [];
const inWindow = (row: EventRow, where: EventWhere) =>
  row.key === where.key &&
  (!where.createdAt.gt || row.createdAt.getTime() > where.createdAt.gt.getTime()) &&
  (!where.createdAt.lte || row.createdAt.getTime() <= where.createdAt.lte.getTime());

const db = {
  rateLimitEvent: {
    findMany: vi.fn(async (args: { where: EventWhere; take: number }) =>
      events
        .filter((row) => inWindow(row, args.where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, args.take)
    ),
    create: vi.fn(async (args: { data: EventRow }) => {
      events.push(args.data);
      return args.data;
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  mediaShare: { findUnique: vi.fn(), updateMany: vi.fn() },
};
const storage: {
  signedUrl?: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} = { signedUrl: vi.fn(), get: vi.fn() };

const auth = vi.fn(async () => {
  throw new Error("the share route must not read a session");
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ getStorage: async () => storage }));
vi.mock("@/auth", () => ({ auth }));

const { GET } = await import("@/app/api/share/[token]/route");
const { SHARE_VIEW_RATE } = await import("@/lib/share");

const TOKEN = "Ab3_".repeat(10) + "xyz"; // 43 URL-safe characters
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");
const SIGNED = "https://bucket.example/selftape/p1/abc.mp4?X-Amz-Signature=secret";
const HOUR = 60 * 60 * 1000;

const working = (over: Record<string, unknown> = {}, media: Record<string, unknown> = {}) => ({
  id: "s1",
  expiresAt: new Date(Date.now() + HOUR),
  revokedAt: null,
  media: {
    storageKey: "selftape/p1/abc.mp4",
    mime: "video/mp4",
    status: "READY",
    profile: { isMinor: false },
    ...media,
  },
  ...over,
});

function open(token: string, headers: Record<string, string> = { "x-real-ip": "203.0.113.7" }) {
  return GET(new Request(`https://www.agental.test/api/share/${token}`, { headers }), {
    params: Promise.resolve({ token }),
  });
}

async function shape(res: Response) {
  return {
    status: res.status,
    body: await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
  };
}

function expectPrivacyHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
}

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  storage.signedUrl = vi.fn(async () => SIGNED);
  storage.get.mockResolvedValue(null);
  db.mediaShare.findUnique.mockResolvedValue(working());
  db.mediaShare.updateMany.mockResolvedValue({ count: 1 });
});

describe("a working link", () => {
  it("is found by the hash of its token, counted, and redirected to a signed address", async () => {
    const res = await open(TOKEN);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED);
    expectPrivacyHeaders(res);

    expect(db.mediaShare.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: TOKEN_HASH });
    // A share link's signed address lives 15 minutes, not the default hour.
    expect(storage.signedUrl).toHaveBeenCalledWith("selftape/p1/abc.mp4", {
      mime: "video/mp4",
      expiresInSeconds: 900,
    });

    const update = db.mediaShare.updateMany.mock.calls[0][0];
    // The count only lands on a link that still works at that instant.
    expect(update.where).toMatchObject({ id: "s1", revokedAt: null });
    expect(update.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(update.data.viewCount).toEqual({ increment: 1 });
    expect(update.data.lastViewedAt).toBeInstanceOf(Date);
  });

  it("needs no session: the handler never asks for one", async () => {
    expect((await open(TOKEN)).status).toBe(302);
    expect(auth).not.toHaveBeenCalled();
  });

  it("counts a player's later pieces as the same viewing", async () => {
    await open(TOKEN, { "x-real-ip": "203.0.113.7", range: "bytes=0-" });
    await open(TOKEN, { "x-real-ip": "203.0.113.7", range: "bytes=1048576-" });
    const [first, later] = db.mediaShare.updateMany.mock.calls.map((call) => call[0].data);
    expect(first.viewCount).toEqual({ increment: 1 });
    expect(later.viewCount).toBeUndefined();
    expect(later.lastViewedAt).toBeInstanceOf(Date);
  });

  it("streams the file itself where storage cannot sign (local disk)", async () => {
    storage.signedUrl = undefined;
    storage.get.mockResolvedValue({ bytes: Buffer.from("video-bytes"), mime: "video/mp4" });
    const res = await open(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(await res.text()).toBe("video-bytes");
    expectPrivacyHeaders(res);
    expect(db.mediaShare.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("refusals", () => {
  it("answer every reason with one identical 404", async () => {
    const cases: Array<[string, () => void, string?]> = [
      ["unknown token", () => db.mediaShare.findUnique.mockResolvedValue(null)],
      ["revoked", () => db.mediaShare.findUnique.mockResolvedValue(working({ revokedAt: new Date(Date.now() - 1000) }))],
      ["expired", () => db.mediaShare.findUnique.mockResolvedValue(working({ expiresAt: new Date(Date.now() - 1000) }))],
      ["clip still processing", () => db.mediaShare.findUnique.mockResolvedValue(working({}, { status: "PROCESSING" }))],
      ["clip failed", () => db.mediaShare.findUnique.mockResolvedValue(working({}, { status: "FAILED" }))],
      ["profile marked as a minor's", () => db.mediaShare.findUnique.mockResolvedValue(working({}, { profile: { isMinor: true } }))],
      ["revoked between the lookup and the count", () => db.mediaShare.updateMany.mockResolvedValue({ count: 0 })],
      ["not a token at all", () => undefined, "not-a-token"],
      ["a token of the wrong length", () => undefined, "a".repeat(44)],
    ];

    const seen: Array<Awaited<ReturnType<typeof shape>>> = [];
    for (const [, arrange, token] of cases) {
      db.mediaShare.findUnique.mockResolvedValue(working());
      db.mediaShare.updateMany.mockResolvedValue({ count: 1 });
      arrange();
      seen.push(await shape(await open(token ?? TOKEN)));
    }

    for (const answer of seen) {
      expect(answer).toEqual(seen[0]);
    }
    expect(seen[0].status).toBe(404);
    expect(seen[0].body).toBe("Not found");
    expect(seen[0].headers).toMatchObject({
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    });
    expect(seen[0].headers.location).toBeUndefined();
  });

  it("do not count a view or sign an address for a link that does not work", async () => {
    db.mediaShare.findUnique.mockResolvedValue(working({ revokedAt: new Date(Date.now() - 1000) }));
    await open(TOKEN);
    db.mediaShare.findUnique.mockResolvedValue(working({}, { status: "PROCESSING" }));
    await open(TOKEN);
    db.mediaShare.findUnique.mockResolvedValue(null);
    await open(TOKEN);
    expect(storage.signedUrl).not.toHaveBeenCalled();
    expect(db.mediaShare.updateMany).not.toHaveBeenCalled();
  });

  it("do not query the database for something that cannot be a token", async () => {
    expect((await open("../../etc/passwd")).status).toBe(404);
    expect(db.mediaShare.findUnique).not.toHaveBeenCalled();
  });

  it("answer 404 when local storage no longer has the file, without counting", async () => {
    storage.signedUrl = undefined;
    storage.get.mockResolvedValue(null);
    const res = await open(TOKEN);
    expect(res.status).toBe(404);
    expectPrivacyHeaders(res);
    expect(db.mediaShare.updateMany).not.toHaveBeenCalled();
  });
});

describe("rate limit", () => {
  it("answers 429 over the limit, the same for a good link and a bad one", async () => {
    for (let i = 0; i < SHARE_VIEW_RATE.limit; i += 1) {
      expect((await open(TOKEN)).status).toBe(302);
    }
    const good = await open(TOKEN);
    expect(good.status).toBe(429);
    expectPrivacyHeaders(good);
    expect(Number(good.headers.get("retry-after"))).toBeGreaterThan(0);

    db.mediaShare.findUnique.mockClear();
    const bad = await open("not-a-token");
    expect(bad.status).toBe(429);
    expect(await bad.text()).toBe(await good.text());
    // Over the limit nothing is looked up, so the answer cannot depend on the token.
    expect(db.mediaShare.findUnique).not.toHaveBeenCalled();
  });

  it("is counted per client address", async () => {
    for (let i = 0; i < SHARE_VIEW_RATE.limit; i += 1) await open(TOKEN);
    expect((await open(TOKEN)).status).toBe(429);
    expect((await open(TOKEN, { "x-real-ip": "198.51.100.9" })).status).toBe(302);
  });

  it("stores a keyed hash, never the address or the token", async () => {
    await open(TOKEN, { "x-real-ip": "203.0.113.7" });
    expect(events).toHaveLength(1);
    expect(events[0].key).toMatch(/^share:view:[0-9a-f]{64}$/);
    const stored = JSON.stringify(events);
    expect(stored).not.toContain("203.0.113.7");
    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toContain(TOKEN_HASH);
  });
});

describe("failures", () => {
  it("answer 503 with the privacy headers, and log neither token, address nor signed URL", async () => {
    storage.signedUrl = vi.fn(async () => {
      throw new Error(`could not sign ${SIGNED}`);
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await open(TOKEN);
    expect(res.status).toBe(503);
    expectPrivacyHeaders(res);
    expect(db.mediaShare.updateMany).not.toHaveBeenCalled();

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("s1");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN_HASH);
    expect(logged).not.toContain("203.0.113.7");
    expect(logged).not.toContain("X-Amz-Signature");
    expect(logged).not.toContain("selftape/p1");
    spy.mockRestore();
  });

  it("answer 503 when the database is down, before anything is known about the token", async () => {
    db.rateLimitEvent.findMany.mockRejectedValueOnce(new Error("connection refused"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await open(TOKEN);
    expect(res.status).toBe(503);
    expectPrivacyHeaders(res);
    expect(db.mediaShare.findUnique).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

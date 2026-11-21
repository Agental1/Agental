import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The share-link helpers: tokens, their hash, the link, the rate-limit key
 * and the owner's listing (with a mocked database). What is under test: the
 * token never appears in what is stored or listed, and a client address never
 * appears in a rate-limit key.
 */

const db = { mediaShare: { findMany: vi.fn() } };
vi.mock("@/lib/db", () => ({ prisma: db }));

const {
  clampShareHours,
  clientAddress,
  hashShareToken,
  isShareToken,
  listShareLinks,
  listShareLinksByMedia,
  newShareToken,
  sharePath,
  shareRateKey,
  shareUrl,
  SHARE_VIEW_RATE,
  startsViewing,
} = await import("@/lib/share");

const NOW = new Date("2026-11-19T10:00:00Z");
const HOUR = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tokens", () => {
  it("are 32 random bytes in base64url: 43 URL-safe characters, never the same twice", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newShareToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(isShareToken(token)).toBe(true);
    }
  });

  it("refuses anything that cannot be a token before a query runs", () => {
    expect(isShareToken("")).toBe(false);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("a".repeat(44))).toBe(false);
    expect(isShareToken(`${"a".repeat(42)}/`)).toBe(false);
    expect(isShareToken(`${"a".repeat(42)}%`)).toBe(false);
    expect(isShareToken(undefined)).toBe(false);
    expect(isShareToken(["a".repeat(43)])).toBe(false);
  });

  it("are stored as their SHA-256 in hex, which does not contain the token", () => {
    const token = newShareToken();
    const hash = hashShareToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
    expect(hashShareToken(token)).toBe(hash);
    expect(hashShareToken(newShareToken())).not.toBe(hash);
  });
});

describe("the link", () => {
  it("points at the public route, on the site origin", () => {
    const token = "a".repeat(43);
    expect(sharePath(token)).toBe(`/api/share/${token}`);
    expect(shareUrl("https://www.agental.test", token)).toBe(
      `https://www.agental.test/api/share/${token}`
    );
    expect(shareUrl("https://www.agental.test/", token)).toBe(
      `https://www.agental.test/api/share/${token}`
    );
  });
});

describe("expiry helpers", () => {
  it("are the domain ones, re-exported for the action and the route", () => {
    expect(clampShareHours()).toBe(72);
    expect(clampShareHours(1000)).toBe(168);
  });
});

describe("clientAddress", () => {
  it("prefers the platform's header, then the first forwarded hop", () => {
    expect(clientAddress(headers({ "x-real-ip": " 203.0.113.7 ", "x-forwarded-for": "198.51.100.1" }))).toBe(
      "203.0.113.7"
    );
    expect(clientAddress(headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
  });

  it("puts requests with no address in one shared bucket", () => {
    expect(clientAddress(headers({}))).toBe("unknown");
  });
});

describe("shareRateKey", () => {
  it("is a keyed hash that never contains the address", () => {
    const key = shareRateKey("203.0.113.7", "secret-a");
    expect(key).toMatch(/^share:view:[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(shareRateKey("203.0.113.7", "secret-a")).toBe(key);
  });

  it("differs by address and by secret", () => {
    const key = shareRateKey("203.0.113.7", "secret-a");
    expect(shareRateKey("203.0.113.8", "secret-a")).not.toBe(key);
    expect(shareRateKey("203.0.113.7", "secret-b")).not.toBe(key);
    // A plain SHA-256 of the address would be reversible by trying them all.
    expect(key).not.toContain(createHash("sha256").update("203.0.113.7").digest("hex"));
  });

  it("allows a positive number of opens per window", () => {
    expect(SHARE_VIEW_RATE.limit).toBeGreaterThan(0);
    expect(SHARE_VIEW_RATE.windowMs).toBeGreaterThan(0);
  });
});

describe("startsViewing", () => {
  it("counts a plain request and one that starts at the first byte", () => {
    expect(startsViewing(null)).toBe(true);
    expect(startsViewing("")).toBe(true);
    expect(startsViewing("bytes=0-")).toBe(true);
    expect(startsViewing("bytes=0-1023")).toBe(true);
    expect(startsViewing("Bytes = 0-")).toBe(true);
  });

  it("does not count a later piece of the same file", () => {
    expect(startsViewing("bytes=1048576-")).toBe(false);
    expect(startsViewing("bytes=500-999")).toBe(false);
    expect(startsViewing("bytes=-500")).toBe(false);
  });

  it("counts a header it cannot read", () => {
    expect(startsViewing("items=0-5")).toBe(true);
    expect(startsViewing("nonsense")).toBe(true);
  });
});

describe("listShareLinks", () => {
  const rows = [
    { id: "s3", createdAt: hoursFromNow(-1), expiresAt: hoursFromNow(71), revokedAt: null, viewCount: 2, lastViewedAt: hoursFromNow(-0.5) },
    { id: "s2", createdAt: hoursFromNow(-5), expiresAt: hoursFromNow(67), revokedAt: hoursFromNow(-2), viewCount: 0, lastViewedAt: null },
    { id: "s1", createdAt: hoursFromNow(-100), expiresAt: hoursFromNow(-28), revokedAt: null, viewCount: 9, lastViewedAt: hoursFromNow(-30) },
  ];

  it("returns each link with whether it works now, and nothing that opens it", async () => {
    db.mediaShare.findMany.mockResolvedValue(rows);
    const links = await listShareLinks("m1", {}, NOW);
    expect(links).toEqual([
      { ...rows[0], active: true },
      { ...rows[1], active: false },
      { ...rows[2], active: false },
    ]);
    for (const link of links) {
      expect(Object.keys(link).sort()).toEqual(
        ["active", "createdAt", "expiresAt", "id", "lastViewedAt", "revokedAt", "viewCount"]
      );
    }
  });

  it("never selects the token hash or who created the link", async () => {
    db.mediaShare.findMany.mockResolvedValue([]);
    await listShareLinks("m1");
    const query = db.mediaShare.findMany.mock.calls[0][0];
    expect(query.select).toEqual({
      id: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      viewCount: true,
      lastViewedAt: true,
    });
    expect(query.where).toEqual({ mediaId: "m1" });
    expect(query.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(query.take).toBe(50);
  });

  it("drops anything a stray column would add", async () => {
    db.mediaShare.findMany.mockResolvedValue([{ ...rows[0], tokenHash: "deadbeef", createdById: "u1" }]);
    const [link] = await listShareLinks("m1", {}, NOW);
    expect(link).not.toHaveProperty("tokenHash");
    expect(link).not.toHaveProperty("createdById");
  });

  it("ties the query to the caller's profile when one is given", async () => {
    db.mediaShare.findMany.mockResolvedValue([]);
    expect(await listShareLinks("m1", { profileId: "p1" })).toEqual([]);
    expect(db.mediaShare.findMany.mock.calls[0][0].where).toEqual({
      mediaId: "m1",
      media: { profileId: "p1" },
    });
  });
});

describe("listShareLinksByMedia", () => {
  it("groups one profile's links by clip, newest first", async () => {
    db.mediaShare.findMany.mockResolvedValue([
      { id: "s3", mediaId: "m2", createdAt: hoursFromNow(-1), expiresAt: hoursFromNow(71), revokedAt: null, viewCount: 0, lastViewedAt: null },
      { id: "s2", mediaId: "m1", createdAt: hoursFromNow(-2), expiresAt: hoursFromNow(70), revokedAt: null, viewCount: 1, lastViewedAt: null },
      { id: "s1", mediaId: "m2", createdAt: hoursFromNow(-90), expiresAt: hoursFromNow(-18), revokedAt: null, viewCount: 4, lastViewedAt: null },
    ]);
    const byMedia = await listShareLinksByMedia("p1", NOW);
    expect(db.mediaShare.findMany.mock.calls[0][0].where).toEqual({ media: { profileId: "p1" } });
    expect(Object.keys(byMedia).sort()).toEqual(["m1", "m2"]);
    expect(byMedia.m2.map((link) => [link.id, link.active])).toEqual([
      ["s3", true],
      ["s1", false],
    ]);
    expect(byMedia.m1).toHaveLength(1);
    expect(byMedia.m1[0]).not.toHaveProperty("mediaId");
  });
});

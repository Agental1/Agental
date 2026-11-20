import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Storage } from "@/lib/storage";
import { WithLegacyReads } from "@/lib/storage/legacy";

/**
 * GET /api/admin/storage/copy, called directly with in-memory stores for
 * Supabase (primary) and R2 (legacy). What is under test: who gets in, the
 * dry-run numbers the move is verified with, and that the copy never hides a
 * file: every R2 file Supabase lacks stays in `left` until it is copied.
 */

const currentAdminId = vi.fn();
const getStorage = vi.fn();
const mediaRows = vi.fn();
const avatarRows = vi.fn();

vi.mock("@/lib/limelight/admin", () => ({ currentAdminId }));
vi.mock("@/lib/storage", () => ({ getStorage }));
vi.mock("@/lib/db", () => ({
  prisma: {
    media: { findMany: mediaRows },
    artistProfile: { findMany: avatarRows },
  },
}));

const route = await import("@/app/api/admin/storage/copy/route");

/**
 * A store backed by a Map. `broken` keys throw on get, `flakyHead` on head,
 * `vanished` are listed but gone by the time they are read.
 */
function memoryStore(
  files: Record<string, number>,
  opts: { broken?: string[]; flakyHead?: string[]; vanished?: string[]; onGet?: () => void } = {}
): Storage & { files: Map<string, number>; gets: string[] } {
  const map = new Map(Object.entries(files));
  const gets: string[] = [];
  return {
    files: map,
    gets,
    async put(key, bytes, mime) {
      map.set(key, bytes.length);
      return { key, size: bytes.length, mime };
    },
    async get(key) {
      gets.push(key);
      opts.onGet?.();
      if (opts.broken?.includes(key)) throw new Error(`could not read ${key}`);
      if (opts.vanished?.includes(key)) return null;
      const size = map.get(key);
      return size === undefined ? null : { bytes: Buffer.alloc(size), mime: "video/mp4" };
    },
    async delete(key) {
      map.delete(key);
    },
    async head(key) {
      if (opts.flakyHead?.includes(key)) throw new Error("429");
      const size = map.get(key);
      return size === undefined ? null : { size, mime: "video/mp4" };
    },
    async list(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

/** Media rows pointing at these keys: only referenced files are copied. */
const referenceAll = (keys: string[]) => mediaRows.mockResolvedValue(keys.map((storageKey) => ({ storageKey })));

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const get = (query = "") => route.GET(new Request(`https://app.test/api/admin/storage/copy${query}`));
const keysOf = (n: number) => Array.from({ length: n }, (_, i) => `u1/media/${String(i).padStart(2, "0")}.mp4`);

// Kept as a reference (not vi.mocked) so the file also runs under bun test,
// which the pregate uses for changed test files.
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  currentAdminId.mockResolvedValue("admin-1");
  mediaRows.mockResolvedValue([]);
  avatarRows.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/storage/copy", () => {
  it("404 for anyone who is not an admin, without touching storage", async () => {
    currentAdminId.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("says there is nothing to copy when storage is not Supabase with an R2 fallback", async () => {
    getStorage.mockResolvedValue(memoryStore({}));
    expect(await (await get()).json()).toEqual({
      note: "Nothing to copy: Supabase or R2 is not configured.",
    });
  });

  it("dry run: counts, sizes and every referenced file, avatars included", async () => {
    const r2 = memoryStore({ "u1/selftape/a.mp4": 100, "u1/avatar/p.jpg": 10, "u2/media/b.mp4": 50 });
    const supabase = memoryStore({ "u2/media/b.mp4": 50, "u3/media/new.mp4": 7 });
    getStorage.mockResolvedValue(new WithLegacyReads(supabase, r2));
    mediaRows.mockResolvedValue([
      { storageKey: "u1/selftape/a.mp4" },
      { storageKey: "u2/media/b.mp4" },
      { storageKey: "u9/media/lost.mp4" },
    ]);
    avatarRows.mockResolvedValue([{ avatarKey: "u1/avatar/p.jpg" }]);

    expect(await (await get()).json()).toEqual({
      complete: true,
      onR2: 3,
      notYetCopied: 2,
      sizeErrors: 0,
      bytesOnR2: 160,
      bytesNotYetCopied: 110,
      bytesInSupabase: 57,
      fitsFreePlan: true,
      referencedFiles: 4,
      referencedOnlyOnR2: 2,
      referencedMissingEverywhere: 1,
      unreferencedOnR2: 0,
    });
  });

  it("fitsFreePlan counts what Supabase already holds, at the 80% line", async () => {
    const r2 = memoryStore({ "u1/media/a.mp4": 0.3 * GB });
    referenceAll(["u1/media/a.mp4"]);
    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({ "u2/media/b.mp4": 0.5 * GB }), r2));
    expect((await (await get()).json()).fitsFreePlan).toBe(true);

    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({ "u2/media/b.mp4": 0.5 * GB + 1 }), r2));
    expect((await (await get()).json()).fitsFreePlan).toBe(false);
  });

  it("a size that cannot be read makes fitsFreePlan unknown instead of guessing", async () => {
    const r2 = memoryStore({ "u1/media/a.mp4": 1, "u1/media/b.mp4": 1 }, { flakyHead: ["u1/media/a.mp4"] });
    referenceAll(["u1/media/a.mp4", "u1/media/b.mp4"]);
    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({}), r2));

    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sizeErrors: 1, fitsFreePlan: null, notYetCopied: 2 });
  });

  it("dry run stops at its time budget and says the numbers are partial", async () => {
    const r2 = memoryStore(Object.fromEntries(keysOf(30).map((k) => [k, 1])));
    referenceAll(keysOf(30));
    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({}), r2));
    // Each clock read moves 15 s: the deadline (40 s after the first read)
    // passes before the third batch of HEADs.
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 15_000));

    const body = await (await get()).json();

    expect(body.complete).toBe(false);
    expect(body.fitsFreePlan).toBeNull();
    expect(body.notYetCopied).toBe(30);
  });

  it("copy: a file Supabase cannot answer for stays in left (nothing is hidden)", async () => {
    const keys = keysOf(3);
    const r2 = memoryStore(Object.fromEntries(keys.map((k) => [k, 1])));
    const supabase = memoryStore({}, { flakyHead: keys });
    referenceAll(keys);
    getStorage.mockResolvedValue(new WithLegacyReads(supabase, r2));

    const body = await (await get("?copy=1")).json();

    // Before: a failing Supabase HEAD dropped the file from both the copy and
    // `left`, so "left 0" could be reached with the file still only on R2.
    expect(body).toMatchObject({ copied: 3, left: 0 });
    for (const key of keys) expect(supabase.files.has(key)).toBe(true);
  });

  it("copy: a broken file is logged without its name and skipped; the files after it still move", async () => {
    const keys = keysOf(30);
    const r2 = memoryStore(Object.fromEntries(keys.map((k) => [k, 1])), { broken: [keys[0]] });
    referenceAll(keys);
    const supabase = memoryStore({});
    getStorage.mockResolvedValue(new WithLegacyReads(supabase, r2));

    const body = await (await get("?copy=1")).json();

    expect(body).toEqual({ copied: 25, failed: 1, tooBig: 0, vanished: 0, left: 5 });
    expect(supabase.files.has(keys[1])).toBe(true);
    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain("[storage-copy] failed");
    expect(logged).not.toContain(keys[0]);
  });

  it("copy: a file too big for its bucket is reported without downloading it", async () => {
    const r2 = memoryStore({ "u1/avatar/big.jpg": 3 * MB, "u1/media/ok.mp4": 1 });
    referenceAll(["u1/media/ok.mp4"]);
    avatarRows.mockResolvedValue([{ avatarKey: "u1/avatar/big.jpg" }]);
    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({}), r2));

    const body = await (await get("?copy=1")).json();

    expect(body).toEqual({ copied: 1, failed: 0, tooBig: 1, vanished: 0, left: 1 });
    expect(r2.gets).not.toContain("u1/avatar/big.jpg");
  });

  it("copy: a file gone from R2 since the listing is counted as vanished", async () => {
    const r2 = memoryStore({ "u1/media/gone.mp4": 1 }, { vanished: ["u1/media/gone.mp4"] });
    referenceAll(["u1/media/gone.mp4"]);
    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({}), r2));

    expect(await (await get("?copy=1")).json()).toEqual({
      copied: 0,
      failed: 0,
      tooBig: 0,
      vanished: 1,
      left: 1,
    });
  });

  it("copy: stops starting new files at the time budget, counted from the request", async () => {
    const r2 = memoryStore(Object.fromEntries(keysOf(30).map((k) => [k, 1])));
    referenceAll(keysOf(30));
    getStorage.mockResolvedValue(new WithLegacyReads(memoryStore({}), r2));
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (now += 10_000));

    const body = await (await get("?copy=1")).json();

    expect(body.copied).toBeLessThan(25);
    expect(body.left).toBe(30 - body.copied);
  });

  // Regression: an R2 file no account points to (a replaced picture, a file
  // whose R2 delete failed after its account was deleted) must never be
  // copied back into Supabase. Found by /ship adversarial review, 2026-11-20.
  it("copy and dry run leave R2 files that no account points to where they are", async () => {
    const r2 = memoryStore({ "u1/media/kept.mp4": 1, "u9/avatar/deleted-account.jpg": 1 });
    const supabase = memoryStore({});
    getStorage.mockResolvedValue(new WithLegacyReads(supabase, r2));
    referenceAll(["u1/media/kept.mp4"]);

    expect(await (await get()).json()).toMatchObject({ notYetCopied: 1, unreferencedOnR2: 1 });
    expect(await (await get("?copy=1")).json()).toMatchObject({ copied: 1, left: 0 });
    expect(supabase.files.has("u9/avatar/deleted-account.jpg")).toBe(false);
  });
});

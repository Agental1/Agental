import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The upload actions with a mocked database and a fake object store. What is
 * under test: who may upload, that the declared file is checked before an
 * address is issued, that the stored file is checked again before a Media row
 * exists, and that nothing is left behind when a check fails.
 */

type Session = { user: { id: string; kind: string } } | null;
let session: Session = { user: { id: "u1", kind: "TALENT" } };

const tx = {
  media: { count: vi.fn(), create: vi.fn() },
  selfTape: { count: vi.fn(), create: vi.fn() },
  upload: { delete: vi.fn() },
};
const db = {
  artistProfile: { findUnique: vi.fn() },
  upload: {
    deleteMany: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(async () => ({})),
  },
  media: { aggregate: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const storage = {
  head: vi.fn(),
  delete: vi.fn(async () => undefined),
  presignUpload: vi.fn() as ReturnType<typeof vi.fn> | undefined,
};
const recomputeCompleteness = vi.fn(async () => 60);

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("@/lib/storage", () => ({ getStorage: async () => storage }));
vi.mock("@/lib/completeness", () => ({ recomputeCompleteness }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createUpload, completeUpload, deleteRecording } = await import(
  "@/app/actions/uploads"
);

const MB = 1024 * 1024;
const represented = {
  id: "p1",
  userId: "u1",
  isMinor: false,
  mandat: { status: "ACTIVE", signedAt: new Date("2026-11-01T00:00:00Z") },
};
const pending = (over: Record<string, unknown> = {}) => ({
  id: "up1",
  profileId: "p1",
  type: "SELFTAPE",
  destination: "library",
  storageKey: "selftape/p1/abc.mp4",
  mime: "video/mp4",
  sizeBytes: 5 * MB,
  expiresAt: new Date(Date.now() + 60_000),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "u1", kind: "TALENT" } };
  db.artistProfile.findUnique.mockResolvedValue(represented);
  db.upload.deleteMany.mockResolvedValue({ count: 0 });
  db.upload.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { sizeBytes: null } });
  db.media.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { sizeBytes: 10 * MB } });
  db.upload.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "up1", ...data }));
  storage.presignUpload = vi.fn(async () => ({
    url: "https://bucket.example/signed",
    headers: { "Content-Type": "video/mp4" },
  }));
  tx.media.count.mockResolvedValue(0);
  tx.media.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "m1", ...data }));
  tx.selfTape.count.mockResolvedValue(2);
});

describe("createUpload", () => {
  const input = { type: "SELFTAPE", mime: "video/mp4;codecs=avc1", sizeBytes: 5 * MB };

  it("is refused without a session, for a casting account, a minor, or no signed mandate", async () => {
    session = null;
    expect(await createUpload(input)).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
    session = { user: { id: "u1", kind: "CASTING" } };
    expect((await createUpload(input)).ok).toBe(false);
    session = { user: { id: "u1", kind: "TALENT" } };
    db.artistProfile.findUnique.mockResolvedValue({ ...represented, isMinor: true });
    expect((await createUpload(input)).ok).toBe(false);
    db.artistProfile.findUnique.mockResolvedValue({ ...represented, mandat: null });
    expect((await createUpload(input)).ok).toBe(false);
    expect(db.upload.create).not.toHaveBeenCalled();
  });

  it("checks the declared type and size before issuing an address", async () => {
    expect(await createUpload({ ...input, mime: "application/zip" })).toEqual({
      ok: false,
      error: { key: "errors.uploadTypeNotAllowed" },
    });
    expect(await createUpload({ ...input, sizeBytes: 151 * MB })).toEqual({
      ok: false,
      error: { key: "errors.uploadTooLarge", values: { limit: 150 } },
    });
    expect(db.upload.create).not.toHaveBeenCalled();
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("counts finished media and uploads in flight against the quota", async () => {
    db.media.aggregate.mockResolvedValue({ _count: { _all: 59 }, _sum: { sizeBytes: 0 } });
    db.upload.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { sizeBytes: 0 } });
    expect(await createUpload(input)).toEqual({ ok: false, error: { key: "errors.uploadQuota" } });
    expect(db.upload.deleteMany).toHaveBeenCalled(); // expired ones stop counting first
  });

  it("records a pending upload and returns a signed address for exactly that file", async () => {
    const result = await createUpload(input);
    expect(result).toMatchObject({
      ok: true,
      uploadId: "up1",
      method: "PUT",
      url: "https://bucket.example/signed",
      headers: { "Content-Type": "video/mp4" },
    });
    const { data } = db.upload.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      profileId: "p1",
      type: "SELFTAPE",
      destination: "library",
      mime: "video/mp4",
      sizeBytes: 5 * MB,
    });
    expect(String(data.storageKey)).toMatch(/^selftape\/p1\/[0-9a-f-]{36}\.mp4$/);
    expect(storage.presignUpload).toHaveBeenCalledWith(data.storageKey, "video/mp4", 5 * MB);
  });

  it("falls back to the local route when storage cannot sign uploads", async () => {
    storage.presignUpload = undefined;
    const result = await createUpload(input);
    expect(result).toMatchObject({ ok: true, url: "/api/uploads/up1", method: "PUT" });
  });
});

describe("completeUpload", () => {
  it("answers not found for someone else's upload", async () => {
    db.upload.findUnique.mockResolvedValue(pending({ profileId: "other" }));
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: false,
      error: { key: "errors.uploadNotFound" },
    });
    expect(storage.head).not.toHaveBeenCalled();
  });

  it("drops an expired upload and its object", async () => {
    db.upload.findUnique.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await completeUpload({ uploadId: "up1" })).ok).toBe(false);
    expect(db.upload.delete).toHaveBeenCalledWith({ where: { id: "up1" } });
    expect(storage.delete).toHaveBeenCalledWith("selftape/p1/abc.mp4");
  });

  it("reports a failed transfer when nothing arrived, and keeps the pending row for a retry", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue(null);
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: false,
      error: { key: "errors.uploadFailed" },
    });
    expect(db.upload.delete).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("discards an object whose size differs from the declared one", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB - 1, mime: "video/mp4" });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: false,
      error: { key: "errors.uploadFailed" },
    });
    expect(storage.delete).toHaveBeenCalledWith("selftape/p1/abc.mp4");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("discards an object stored with a type that is not allowed", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "text/html" });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: false,
      error: { key: "errors.uploadTypeNotAllowed" },
    });
    expect(storage.delete).toHaveBeenCalled();
    expect(db.upload.delete).toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("creates the media, the self-tape and removes the pending row in one transaction", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    const result = await completeUpload({
      uploadId: "up1",
      durationSec: 61,
      metrics: { framing: 0.9, light: 0.8, sound: 0.9, durationMs: 61000 },
    });
    expect(result).toMatchObject({ ok: true, mediaId: "m1" });
    expect(result.ok && typeof result.score).toBe("number");
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({
      profileId: "p1",
      type: "SELFTAPE",
      storageKey: "selftape/p1/abc.mp4",
      destination: "library",
      sizeBytes: 5 * MB,
      durationSec: 61,
      isPrimary: false,
    });
    expect(tx.selfTape.create.mock.calls[0][0].data).toMatchObject({
      mediaId: "m1",
      takeNumber: 3,
      status: "READY",
    });
    expect(tx.upload.delete).toHaveBeenCalledWith({ where: { id: "up1" } });
    expect(recomputeCompleteness).toHaveBeenCalledWith("p1");
  });

  it("makes the first photo the primary one and creates no self-tape row", async () => {
    db.upload.findUnique.mockResolvedValue(
      pending({ type: "PHOTO", destination: "profile", storageKey: "media/p1/a.jpg", mime: "image/jpeg", sizeBytes: 2 * MB })
    );
    storage.head.mockResolvedValue({ size: 2 * MB, mime: "image/jpeg" });
    tx.media.count.mockResolvedValue(0);
    await completeUpload({ uploadId: "up1" });
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({ type: "PHOTO", isPrimary: true });
    expect(tx.selfTape.create).not.toHaveBeenCalled();
  });

  it("settles a double completion on the row the other request created", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    db.media.findUnique.mockResolvedValue({ id: "m-existing" });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({ ok: true, mediaId: "m-existing" });
  });
});

describe("deleteRecording", () => {
  const row = { id: "m1", storageKey: "selftape/p1/abc.mp4", profileId: "p1", profile: { userId: "u1" } };

  it("answers not found for media that belongs to someone else", async () => {
    db.media.findUnique.mockResolvedValue({ ...row, profile: { userId: "other" } });
    expect(await deleteRecording("m1")).toEqual({ ok: false, error: { key: "errors.mediaNotFound" } });
    expect(db.media.delete).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("removes the row, then the stored file", async () => {
    db.media.findUnique.mockResolvedValue(row);
    const order: string[] = [];
    db.media.delete.mockImplementation(async () => void order.push("row"));
    storage.delete.mockImplementation(async () => void order.push("file"));
    expect(await deleteRecording("m1")).toEqual({ ok: true });
    expect(order).toEqual(["row", "file"]);
  });

  it("still succeeds when storage fails, leaving the orphan for a sweep", async () => {
    db.media.findUnique.mockResolvedValue(row);
    db.media.delete.mockResolvedValue({});
    storage.delete.mockRejectedValueOnce(new Error("storage down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deleteRecording("m1")).toEqual({ ok: true });
    spy.mockRestore();
  });
});

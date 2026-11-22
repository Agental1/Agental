import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The upload actions with a mocked database and a fake object store. What is
 * under test: who may upload, that the declared file is checked before an
 * address is issued, that the stored file is checked again before a Media row
 * exists, and that nothing is left behind when a check fails. For self-tapes:
 * that a file joins the caller's own tape as its next version, or starts a
 * new tape as version 1.
 */

type Session = { user: { id: string; kind: string } } | null;
let session: Session = { user: { id: "u1", kind: "TALENT" } };

const tx = {
  media: { count: vi.fn(), create: vi.fn(), delete: vi.fn() },
  selfTape: { count: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  tape: { create: vi.fn(), updateMany: vi.fn() },
  upload: { delete: vi.fn() },
  auditLog: { create: vi.fn() },
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
  tape: { findFirst: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const storage = {
  head: vi.fn(),
  delete: vi.fn(async () => undefined),
  presignUpload: vi.fn() as ReturnType<typeof vi.fn> | undefined,
};
const recomputeCompleteness = vi.fn(async () => 60);

// A clip in a submitted application response cannot be deleted; these tests cover the rest.
vi.mock("@/lib/media-locks", () => ({ usedInSubmittedResponse: vi.fn(async () => false), tapeUsedInSubmittedResponse: vi.fn(async () => false) }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("@/lib/storage", () => ({ getStorage: async () => storage }));
vi.mock("@/lib/completeness", () => ({ recomputeCompleteness }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createUpload, completeUpload, deleteRecording } = await import(
  "@/app/actions/uploads"
);

const MB = 1024 * 1024;
const adult = { id: "p1", userId: "u1", isMinor: false };
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
  db.artistProfile.findUnique.mockResolvedValue(adult);
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
  tx.selfTape.aggregate.mockResolvedValue({ _max: { takeNumber: null } });
  tx.tape.create.mockResolvedValue({ id: "t-new" });
  tx.tape.updateMany.mockResolvedValue({ count: 1 });
  db.tape.findFirst.mockResolvedValue(null);
});

describe("createUpload", () => {
  const input = { type: "SELFTAPE", mime: "video/mp4;codecs=avc1", sizeBytes: 5 * MB };

  it("is refused without a session, for a casting account, with no profile, or for a minor", async () => {
    // Only a missing session says "sign in": the browser sends the person to
    // the sign-in page on that key alone, so a signed-in person never sees it.
    const unauthorized = { ok: false, error: { key: "errors.unauthorized" } };
    const notAllowed = { ok: false, error: { key: "errors.mediaNotAllowed" } };
    session = null;
    expect(await createUpload(input)).toEqual(unauthorized);
    session = { user: { id: "u1", kind: "CASTING" } };
    expect(await createUpload(input)).toEqual({ ok: false, error: { key: "errors.mediaCastingAccount" } });
    session = { user: { id: "u1", kind: "TALENT" } };
    db.artistProfile.findUnique.mockResolvedValue(null);
    expect(await createUpload(input)).toEqual(notAllowed);
    db.artistProfile.findUnique.mockResolvedValue({ ...adult, isMinor: true });
    expect(await createUpload(input)).toEqual({ ok: false, error: { key: "errors.mediaMinor" } });
    expect(db.upload.create).not.toHaveBeenCalled();
  });

  it("asks for the caller's own profile and an adult, and no mandate", async () => {
    expect((await createUpload(input)).ok).toBe(true);
    // The profile is looked up by the session's user, and the mandate is not read.
    expect(db.artistProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("checks the declared type and size before issuing an address", async () => {
    expect(await createUpload({ ...input, mime: "application/zip" })).toEqual({
      ok: false,
      error: { key: "errors.uploadTypeNotAllowed" },
    });
    expect(await createUpload({ ...input, sizeBytes: 151 * MB })).toEqual({
      ok: false,
      error: { key: "errors.uploadTooLarge", values: { limit: 50 } },
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
    expect(String(data.storageKey)).toMatch(/^u1\/selftape\/[0-9a-f-]{36}\.mp4$/);
    expect(storage.presignUpload).toHaveBeenCalledWith(data.storageKey, "video/mp4", 5 * MB);
  });

  it("falls back to the local route when storage cannot sign uploads", async () => {
    storage.presignUpload = undefined;
    const result = await createUpload(input);
    expect(result).toMatchObject({ ok: true, url: "/api/uploads/up1", method: "PUT" });
  });

  it("stores no tape, title, brief or consent version when none is sent", async () => {
    await createUpload(input);
    expect(db.tape.findFirst).not.toHaveBeenCalled();
    expect(db.upload.create.mock.calls[0][0].data).toMatchObject({
      tapeId: null,
      title: null,
      demoBrief: null,
      consentVersion: null,
    });
  });

  it("refuses a tape that is not the caller's, with the answer for a missing one", async () => {
    db.tape.findFirst.mockResolvedValue(null);
    expect(await createUpload({ ...input, tapeId: "t-other" })).toEqual({
      ok: false,
      error: { key: "errors.tapeNotFound" },
    });
    // Ownership is part of the query: the tape must hang off the caller's profile.
    expect(db.tape.findFirst).toHaveBeenCalledWith({
      where: { id: "t-other", profileId: "p1" },
      select: { id: true },
    });
    expect(db.upload.create).not.toHaveBeenCalled();
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("stores the tape, title, brief and consent version, trimmed", async () => {
    db.tape.findFirst.mockResolvedValue({ id: "t1" });
    const result = await createUpload({
      ...input,
      tapeId: "t1",
      title: "  Monologue  ",
      demoBrief: " Two minutes, to camera. ",
      consentVersion: " 2026-11 ",
    });
    expect(result.ok).toBe(true);
    expect(db.upload.create.mock.calls[0][0].data).toMatchObject({
      tapeId: "t1",
      title: "Monologue",
      demoBrief: "Two minutes, to camera.",
      consentVersion: "2026-11",
    });
  });

  it("refuses a title, brief or consent version that is too long", async () => {
    for (const over of [
      { title: "x".repeat(121) },
      { demoBrief: "x".repeat(2001) },
      { consentVersion: "x".repeat(41) },
    ]) {
      expect(await createUpload({ ...input, ...over })).toEqual({
        ok: false,
        error: { key: "errors.invalidInput" },
      });
    }
    expect(db.upload.create).not.toHaveBeenCalled();
  });

  it("ignores a tape on a photo or a video, which have no versions", async () => {
    const result = await createUpload({
      type: "VIDEO",
      mime: "video/mp4",
      sizeBytes: 5 * MB,
      tapeId: "t1",
      demoBrief: "brief",
      title: "Reel",
    });
    expect(result.ok).toBe(true);
    expect(db.tape.findFirst).not.toHaveBeenCalled();
    expect(db.upload.create.mock.calls[0][0].data).toMatchObject({
      type: "VIDEO",
      tapeId: null,
      demoBrief: null,
      title: "Reel",
    });
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

  it("creates the media, a new tape with the file as version 1, and removes the pending row in one transaction", async () => {
    db.upload.findUnique.mockResolvedValue(
      pending({ title: "Monologue", demoBrief: "To camera.", consentVersion: "2026-11" })
    );
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    const result = await completeUpload({
      uploadId: "up1",
      durationSec: 61,
      metrics: { framing: 0.9, light: 0.8, sound: 0.9, durationMs: 61000 },
    });
    expect(result).toMatchObject({ ok: true, mediaId: "m1", tapeId: "t-new", takeNumber: 1 });
    expect(result.ok && typeof result.score).toBe("number");
    expect(tx.tape.create.mock.calls[0][0].data).toEqual({
      profileId: "p1",
      title: "Monologue",
      demoBrief: "To camera.",
    });
    expect(tx.tape.updateMany).not.toHaveBeenCalled();
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({
      profileId: "p1",
      type: "SELFTAPE",
      storageKey: "selftape/p1/abc.mp4",
      destination: "library",
      sizeBytes: 5 * MB,
      durationSec: 61,
      isPrimary: false,
      status: "READY",
      title: "Monologue",
      consentVersion: "2026-11",
    });
    expect(tx.selfTape.create.mock.calls[0][0].data).toMatchObject({
      mediaId: "m1",
      tapeId: "t-new",
      takeNumber: 1,
      status: "READY",
    });
    expect(tx.upload.delete).toHaveBeenCalledWith({ where: { id: "up1" } });
    expect(recomputeCompleteness).toHaveBeenCalledWith("p1");
  });

  it("gives a tape started with no title an empty one, for the interface to label", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: true,
      mediaId: "m1",
      tapeId: "t-new",
      takeNumber: 1,
    });
    expect(tx.tape.create.mock.calls[0][0].data).toEqual({
      profileId: "p1",
      title: "",
      demoBrief: null,
    });
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({
      title: null,
      consentVersion: null,
    });
  });

  it("adds the next version to the tape named at createUpload", async () => {
    db.upload.findUnique.mockResolvedValue(pending({ tapeId: "t1", title: "Second try" }));
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    tx.selfTape.aggregate.mockResolvedValue({ _max: { takeNumber: 4 } });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: true,
      mediaId: "m1",
      tapeId: "t1",
      takeNumber: 5,
    });
    // The tape is touched (and so locked) before its versions are counted,
    // and only as the caller's own tape.
    expect(tx.tape.updateMany.mock.calls[0][0].where).toEqual({ id: "t1", profileId: "p1" });
    expect(tx.selfTape.aggregate).toHaveBeenCalledWith({
      where: { tapeId: "t1" },
      _max: { takeNumber: true },
    });
    expect(tx.tape.create).not.toHaveBeenCalled();
    expect(tx.selfTape.create.mock.calls[0][0].data).toMatchObject({ tapeId: "t1", takeNumber: 5 });
    // The file's own title is kept; the tape keeps its title.
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({ title: "Second try" });
  });

  it("numbers the first version of an empty tape 1", async () => {
    db.upload.findUnique.mockResolvedValue(pending({ tapeId: "t1" }));
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    tx.selfTape.aggregate.mockResolvedValue({ _max: { takeNumber: null } });
    expect(await completeUpload({ uploadId: "up1" })).toMatchObject({ tapeId: "t1", takeNumber: 1 });
  });

  it("discards a version whose tape was deleted while it was uploading", async () => {
    db.upload.findUnique.mockResolvedValue(pending({ tapeId: "t-gone" }));
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    tx.tape.updateMany.mockResolvedValue({ count: 0 });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: false,
      error: { key: "errors.tapeNotFound" },
    });
    expect(tx.media.create).not.toHaveBeenCalled();
    expect(tx.selfTape.create).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith("selftape/p1/abc.mp4");
    expect(db.upload.delete).toHaveBeenCalledWith({ where: { id: "up1" } });
    expect(recomputeCompleteness).not.toHaveBeenCalled();
  });

  it("makes the first photo the primary one and creates no self-tape row", async () => {
    db.upload.findUnique.mockResolvedValue(
      pending({ type: "PHOTO", destination: "profile", storageKey: "media/p1/a.jpg", mime: "image/jpeg", sizeBytes: 2 * MB })
    );
    storage.head.mockResolvedValue({ size: 2 * MB, mime: "image/jpeg" });
    tx.media.count.mockResolvedValue(0);
    await completeUpload({ uploadId: "up1" });
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({
      type: "PHOTO",
      isPrimary: true,
      status: "READY",
    });
    expect(tx.selfTape.create).not.toHaveBeenCalled();
    expect(tx.tape.create).not.toHaveBeenCalled();
    expect(tx.tape.updateMany).not.toHaveBeenCalled();
  });

  it("keeps a video out of tapes, and answers with no tape", async () => {
    db.upload.findUnique.mockResolvedValue(
      pending({ type: "VIDEO", destination: "profile", storageKey: "media/p1/a.mp4", title: "Reel" })
    );
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({ ok: true, mediaId: "m1" });
    expect(tx.media.create.mock.calls[0][0].data).toMatchObject({ type: "VIDEO", title: "Reel" });
    expect(tx.selfTape.create).not.toHaveBeenCalled();
    expect(tx.tape.create).not.toHaveBeenCalled();
  });

  it("settles a double completion on the row the other request created", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    db.media.findUnique.mockResolvedValue({ id: "m-existing" });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({ ok: true, mediaId: "m-existing" });
  });

  it("answers a double completion with the tape the other request chose", async () => {
    db.upload.findUnique.mockResolvedValue(pending());
    storage.head.mockResolvedValue({ size: 5 * MB, mime: "video/mp4" });
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    db.media.findUnique.mockResolvedValue({
      id: "m-existing",
      selfTape: { tapeId: "t7", takeNumber: 2 },
    });
    expect(await completeUpload({ uploadId: "up1" })).toEqual({
      ok: true,
      mediaId: "m-existing",
      tapeId: "t7",
      takeNumber: 2,
    });
  });
});

describe("deleteRecording", () => {
  const row = {
    id: "m1",
    type: "SELFTAPE",
    destination: "library",
    storageKey: "selftape/p1/abc.mp4",
    profileId: "p1",
    profile: { userId: "u1" },
  };

  it("answers not found for media that belongs to someone else", async () => {
    db.media.findUnique.mockResolvedValue({ ...row, profile: { userId: "other" } });
    expect(await deleteRecording("m1")).toEqual({ ok: false, error: { key: "errors.mediaNotFound" } });
    expect(tx.media.delete).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("removes the row, then the stored file", async () => {
    db.media.findUnique.mockResolvedValue(row);
    const order: string[] = [];
    tx.media.delete.mockImplementation(async () => void order.push("row"));
    storage.delete.mockImplementation(async () => void order.push("file"));
    expect(await deleteRecording("m1")).toEqual({ ok: true });
    expect(order).toEqual(["row", "file"]);
  });

  it("writes one audit entry with the row, naming no file and no storage key", async () => {
    db.media.findUnique.mockResolvedValue(row);
    await deleteRecording("m1");
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = tx.auditLog.create.mock.calls[0][0] as { data: Record<string, string> };
    expect(data).toMatchObject({
      actorUserId: "u1",
      action: "media.delete",
      resourceType: "Media",
      resourceId: "m1",
    });
    expect(JSON.stringify(data)).not.toContain("selftape/p1/abc.mp4");
  });

  it("still succeeds when storage fails, leaving the orphan for a sweep", async () => {
    db.media.findUnique.mockResolvedValue(row);
    tx.media.delete.mockResolvedValue({});
    storage.delete.mockRejectedValueOnce(new Error("storage down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deleteRecording("m1")).toEqual({ ok: true });
    // The log names the record, never the storage key.
    expect(JSON.stringify(spy.mock.calls)).not.toContain("selftape/p1/abc.mp4");
    spy.mockRestore();
  });
});

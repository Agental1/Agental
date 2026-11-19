import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * renameTape and deleteTape with a mocked database and a fake object store.
 * What is under test: only the owner can touch a tape, a foreign tape looks
 * like a missing one, and deleting removes every version (rows, pending
 * uploads, files) with one audit entry that holds ids and counts only.
 */

type Session = { user: { id: string; kind: string } } | null;
let session: Session = { user: { id: "u1", kind: "TALENT" } };

const tx = {
  tape: { updateMany: vi.fn(), delete: vi.fn() },
  selfTape: { findMany: vi.fn() },
  upload: { findMany: vi.fn(), deleteMany: vi.fn() },
  mediaShare: { count: vi.fn() },
  media: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};
const db = {
  tape: { findFirst: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
const storage = { delete: vi.fn<(key: string) => Promise<void>>(async () => undefined) };
const recomputeCompleteness = vi.fn(async () => 60);
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("@/lib/storage", () => ({ getStorage: async () => storage }));
vi.mock("@/lib/completeness", () => ({ recomputeCompleteness }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { renameTape, deleteTape } = await import("@/app/actions/tapes");

const unauthorized = { ok: false, error: { key: "errors.unauthorized" } };
const notFound = { ok: false, error: { key: "errors.tapeNotFound" } };

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "u1", kind: "TALENT" } };
  db.tape.findFirst.mockResolvedValue({ id: "t1", profileId: "p1" });
  db.tape.updateMany.mockResolvedValue({ count: 1 });
  tx.tape.updateMany.mockResolvedValue({ count: 1 });
  tx.selfTape.findMany.mockResolvedValue([
    { media: { id: "m1", storageKey: "selftape/p1/a.mp4" } },
    { media: { id: "m2", storageKey: "selftape/p1/b.mp4" } },
  ]);
  tx.upload.findMany.mockResolvedValue([]);
  tx.mediaShare.count.mockResolvedValue(3);
  storage.delete.mockResolvedValue(undefined);
});

describe("renameTape", () => {
  it("is refused without a session or for a casting account", async () => {
    session = null;
    expect(await renameTape("t1", { title: "New" })).toEqual(unauthorized);
    session = { user: { id: "u1", kind: "CASTING" } };
    expect(await renameTape("t1", { title: "New" })).toEqual(unauthorized);
    expect(db.tape.findFirst).not.toHaveBeenCalled();
    expect(db.tape.updateMany).not.toHaveBeenCalled();
  });

  it("answers not found for a tape that is missing or belongs to someone else", async () => {
    db.tape.findFirst.mockResolvedValue(null);
    expect(await renameTape("t-other", { title: "New" })).toEqual(notFound);
    // Ownership is part of the query, read from the session.
    expect(db.tape.findFirst.mock.calls[0][0].where).toEqual({
      id: "t-other",
      profile: { userId: "u1" },
    });
    expect(db.tape.updateMany).not.toHaveBeenCalled();
  });

  it("answers not found for an id that cannot be one", async () => {
    expect(await renameTape("", { title: "New" })).toEqual(notFound);
    expect(await renameTape("x".repeat(101), { title: "New" })).toEqual(notFound);
    expect(await renameTape(42 as unknown as string, { title: "New" })).toEqual(notFound);
    expect(db.tape.findFirst).not.toHaveBeenCalled();
  });

  it("refuses a title or a brief that is too long, or no title at all", async () => {
    const invalid = { ok: false, error: { key: "errors.invalidInput" } };
    expect(await renameTape("t1", { title: "x".repeat(121) })).toEqual(invalid);
    expect(await renameTape("t1", { title: "a", demoBrief: "x".repeat(2001) })).toEqual(invalid);
    expect(await renameTape("t1", {} as { title: string })).toEqual(invalid);
    expect(db.tape.updateMany).not.toHaveBeenCalled();
  });

  it("changes the title only, trimmed, when no brief is sent", async () => {
    expect(await renameTape("t1", { title: "  New name " })).toEqual({ ok: true });
    expect(db.tape.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", profileId: "p1" },
      data: { title: "New name" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it("sets the brief when one is sent, and clears it on null or blank text", async () => {
    await renameTape("t1", { title: "A", demoBrief: " To camera. " });
    expect(db.tape.updateMany.mock.calls[0][0].data).toEqual({ title: "A", demoBrief: "To camera." });
    await renameTape("t1", { title: "A", demoBrief: null });
    expect(db.tape.updateMany.mock.calls[1][0].data).toEqual({ title: "A", demoBrief: null });
    await renameTape("t1", { title: "A", demoBrief: "  " });
    expect(db.tape.updateMany.mock.calls[2][0].data).toEqual({ title: "A", demoBrief: null });
  });

  it("accepts an empty title, which means untitled", async () => {
    expect(await renameTape("t1", { title: "   " })).toEqual({ ok: true });
    expect(db.tape.updateMany.mock.calls[0][0].data).toEqual({ title: "" });
  });

  it("answers not found when the tape was deleted in the meantime", async () => {
    db.tape.updateMany.mockResolvedValue({ count: 0 });
    expect(await renameTape("t1", { title: "New" })).toEqual(notFound);
  });
});

describe("deleteTape", () => {
  it("is refused without a session or for a casting account", async () => {
    session = null;
    expect(await deleteTape("t1")).toEqual(unauthorized);
    session = { user: { id: "u1", kind: "CASTING" } };
    expect(await deleteTape("t1")).toEqual(unauthorized);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("answers not found for a tape that is missing or belongs to someone else, and deletes nothing", async () => {
    db.tape.findFirst.mockResolvedValue(null);
    expect(await deleteTape("t-other")).toEqual(notFound);
    expect(db.tape.findFirst.mock.calls[0][0].where).toEqual({
      id: "t-other",
      profile: { userId: "u1" },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("deletes every version, the tape and then the files", async () => {
    const order: string[] = [];
    tx.media.deleteMany.mockImplementation(async () => void order.push("media rows"));
    tx.tape.delete.mockImplementation(async () => void order.push("tape row"));
    storage.delete.mockImplementation(async (key: string) => void order.push(`file ${key}`));

    expect(await deleteTape("t1")).toEqual({ ok: true });

    // The tape row is touched first, which locks it against a late version.
    expect(tx.tape.updateMany.mock.calls[0][0].where).toEqual({ id: "t1", profileId: "p1" });
    expect(tx.selfTape.findMany.mock.calls[0][0].where).toEqual({
      tapeId: "t1",
      media: { profileId: "p1" },
    });
    // Deleting the Media rows is what removes self-tape records, share links
    // and draft attachments: the database cascades from Media.
    expect(tx.media.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] }, profileId: "p1" },
    });
    expect(tx.tape.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(order).toEqual([
      "media rows",
      "tape row",
      "file selftape/p1/a.mp4",
      "file selftape/p1/b.mp4",
    ]);
    expect(recomputeCompleteness).toHaveBeenCalledWith("p1");
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/talents/(space)", "layout");
  });

  it("writes one audit entry, with ids and counts and nothing else", async () => {
    await deleteTape("t1");
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = tx.auditLog.create.mock.calls[0][0] as { data: Record<string, string> };
    expect(data).toMatchObject({
      actorUserId: "u1",
      action: "tape.delete",
      resourceType: "Tape",
      resourceId: "t1",
    });
    expect(JSON.parse(data.before)).toEqual({
      mediaIds: ["m1", "m2"],
      versions: 2,
      shareLinks: 3,
      pendingUploads: 0,
    });
    expect(JSON.stringify(data)).not.toContain("selftape/");
  });

  it("drops an upload still on its way to the tape, row and file", async () => {
    tx.upload.findMany.mockResolvedValue([{ id: "up9", storageKey: "selftape/p1/late.mp4" }]);
    expect(await deleteTape("t1")).toEqual({ ok: true });
    expect(tx.upload.findMany.mock.calls[0][0].where).toEqual({ tapeId: "t1", profileId: "p1" });
    expect(tx.upload.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["up9"] } } });
    expect(storage.delete).toHaveBeenCalledWith("selftape/p1/late.mp4");
    const { data } = tx.auditLog.create.mock.calls[0][0] as { data: { before: string } };
    expect(JSON.parse(data.before).pendingUploads).toBe(1);
  });

  it("deletes a tape that has no version left", async () => {
    tx.selfTape.findMany.mockResolvedValue([]);
    expect(await deleteTape("t1")).toEqual({ ok: true });
    expect(tx.media.deleteMany).not.toHaveBeenCalled();
    expect(tx.mediaShare.count).not.toHaveBeenCalled();
    expect(tx.tape.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("answers not found when another request deleted the tape first", async () => {
    tx.tape.updateMany.mockResolvedValue({ count: 0 });
    expect(await deleteTape("t1")).toEqual(notFound);
    expect(tx.media.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("still succeeds when a file cannot be removed, and logs no storage key", async () => {
    storage.delete.mockRejectedValueOnce(new Error("storage down: selftape/p1/a.mp4"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deleteTape("t1")).toEqual({ ok: true });
    // The other file is still attempted.
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("selftape/");
    expect(JSON.stringify(spy.mock.calls)).toContain("t1");
    spy.mockRestore();
  });
});

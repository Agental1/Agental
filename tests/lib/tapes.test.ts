import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * listTapes and the Recording it is made of, with a mocked database. What is
 * under test: the shape handed to the interface, the order asked of the
 * database, and that every query is tied to the profile it was called for.
 */

const db = {
  tape: { findMany: vi.fn() },
  media: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: db }));

const { listTapes } = await import("@/lib/tapes");
const { listRecordings, toRecording } = await import("@/lib/recordings");

const at = (iso: string) => new Date(iso);

const mediaRow = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  profileId: "p1",
  type: "SELFTAPE",
  storageKey: "selftape/p1/abc.mp4",
  mime: "video/mp4",
  destination: "library",
  sizeBytes: 1000,
  durationSec: 30,
  order: 0,
  isPrimary: false,
  createdAt: at("2026-11-10T10:00:00Z"),
  status: "READY",
  title: null,
  consentVersion: "2026-11",
  updatedAt: at("2026-11-10T10:00:00Z"),
  ...over,
});

const takeRow = (over: Record<string, unknown> = {}) => ({
  id: "st1",
  mediaId: "m1",
  tapeId: "t1",
  takeNumber: 1,
  qualityScore: 80,
  createdAt: at("2026-11-10T10:00:00Z"),
  media: mediaRow(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toRecording", () => {
  it("carries the upload state, the title and the tape", () => {
    const recording = toRecording({
      ...mediaRow({ title: "Monologue" }),
      selfTape: { qualityScore: 80, takeNumber: 3, tapeId: "t1" },
    });
    expect(recording).toEqual({
      id: "m1",
      type: "SELFTAPE",
      destination: "library",
      mime: "video/mp4",
      sizeBytes: 1000,
      durationSec: 30,
      createdAt: at("2026-11-10T10:00:00Z"),
      qualityScore: 80,
      takeNumber: 3,
      status: "READY",
      title: "Monologue",
      tapeId: "t1",
      url: "/api/media/m1",
    });
  });

  it("never hands out the storage key or the consent version", () => {
    const recording = toRecording({ ...mediaRow(), selfTape: null });
    expect(JSON.stringify(recording)).not.toContain("selftape/p1/abc.mp4");
    expect(recording).not.toHaveProperty("storageKey");
    expect(recording).not.toHaveProperty("consentVersion");
  });

  it("gives a video no tape and no version number", () => {
    const recording = toRecording({
      ...mediaRow({ type: "VIDEO", destination: "profile" }),
      selfTape: null,
    });
    expect(recording).toMatchObject({
      type: "VIDEO",
      destination: "profile",
      tapeId: null,
      takeNumber: null,
      qualityScore: null,
    });
  });

  it("reports the processing and failed states, and never an unknown one as ready", () => {
    const status = (value: string) =>
      toRecording({ ...mediaRow({ status: value }), selfTape: null }).status;
    expect(status("PROCESSING")).toBe("PROCESSING");
    expect(status("FAILED")).toBe("FAILED");
    expect(status("something-else")).toBe("FAILED");
  });
});

describe("listRecordings", () => {
  it("asks for the tape of each self-tape and returns the new fields", async () => {
    db.media.findMany.mockResolvedValue([
      {
        ...mediaRow({ title: "Monologue" }),
        selfTape: { qualityScore: null, takeNumber: 2, tapeId: "t1" },
      },
      { ...mediaRow({ id: "m0", status: "PROCESSING" }), selfTape: { qualityScore: null, takeNumber: 1, tapeId: null } },
    ]);
    const list = await listRecordings("p1", { destination: "library" });
    expect(db.media.findMany.mock.calls[0][0]).toMatchObject({
      where: { profileId: "p1", destination: "library" },
      include: { selfTape: { select: { tapeId: true, takeNumber: true } } },
    });
    expect(list[0]).toMatchObject({ status: "READY", title: "Monologue", tapeId: "t1" });
    // A self-tape saved before tapes existed belongs to none.
    expect(list[1]).toMatchObject({ status: "PROCESSING", title: null, tapeId: null });
  });
});

describe("listTapes", () => {
  it("returns each tape with its versions as recordings", async () => {
    db.tape.findMany.mockResolvedValue([
      {
        id: "t2",
        profileId: "p1",
        title: "",
        demoBrief: null,
        createdAt: at("2026-11-12T10:00:00Z"),
        updatedAt: at("2026-11-12T10:00:00Z"),
        takes: [],
      },
      {
        id: "t1",
        profileId: "p1",
        title: "Monologue",
        demoBrief: "To camera.",
        createdAt: at("2026-11-10T10:00:00Z"),
        updatedAt: at("2026-11-11T10:00:00Z"),
        takes: [
          takeRow({
            id: "st2",
            mediaId: "m2",
            takeNumber: 2,
            qualityScore: null,
            media: mediaRow({ id: "m2", title: "Second try", createdAt: at("2026-11-11T10:00:00Z") }),
          }),
          takeRow(),
        ],
      },
    ]);

    const tapes = await listTapes("p1");

    expect(tapes).toHaveLength(2);
    // A tape with no version left, and no title: both are valid.
    expect(tapes[0]).toEqual({
      id: "t2",
      title: "",
      demoBrief: null,
      createdAt: at("2026-11-12T10:00:00Z"),
      versions: [],
    });
    expect(Object.keys(tapes[1]).sort()).toEqual(["createdAt", "demoBrief", "id", "title", "versions"]);
    expect(tapes[1]).toMatchObject({ id: "t1", title: "Monologue", demoBrief: "To camera." });
    expect(tapes[1].versions).toEqual([
      {
        id: "m2",
        type: "SELFTAPE",
        destination: "library",
        mime: "video/mp4",
        sizeBytes: 1000,
        durationSec: 30,
        createdAt: at("2026-11-11T10:00:00Z"),
        qualityScore: null,
        takeNumber: 2,
        status: "READY",
        title: "Second try",
        tapeId: "t1",
        url: "/api/media/m2",
      },
      expect.objectContaining({ id: "m1", takeNumber: 1, qualityScore: 80, tapeId: "t1" }),
    ]);
    expect(JSON.stringify(tapes)).not.toContain("selftape/p1/");
  });

  it("asks for one profile's tapes, newest first, versions newest first", async () => {
    db.tape.findMany.mockResolvedValue([]);
    expect(await listTapes("p1")).toEqual([]);
    const query = db.tape.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ profileId: "p1" });
    expect(query.orderBy[0]).toEqual({ createdAt: "desc" });
    // Versions are tied to the same profile again, and sorted newest first.
    expect(query.include.takes.where).toEqual({ media: { profileId: "p1" } });
    expect(query.include.takes.orderBy[0]).toEqual({ createdAt: "desc" });
  });
});

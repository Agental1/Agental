import { describe, expect, it } from "vitest";
import {
  baseMime,
  checkUpload,
  CompleteUploadInput,
  CreateUploadInput,
  defaultDestination,
  overQuota,
  RenameTapeInput,
  storageKeyFor,
  storagePrefixesFor,
  toMediaStatus,
  UNTITLED_TAPE_TITLE,
  UPLOAD_LIMITS,
  UPLOAD_QUOTA,
} from "@/domain/uploads";

const MB = 1024 * 1024;

describe("baseMime", () => {
  it("drops codec parameters and case", () => {
    expect(baseMime("video/webm;codecs=vp9,opus")).toBe("video/webm");
    expect(baseMime("Video/MP4")).toBe("video/mp4");
    expect(baseMime(undefined)).toBe("");
  });
});

describe("checkUpload", () => {
  it("accepts what each browser records", () => {
    expect(checkUpload("SELFTAPE", "video/webm;codecs=vp8", 20 * MB)).toBeNull();
    expect(checkUpload("SELFTAPE", "video/mp4", 20 * MB)).toBeNull();
    expect(checkUpload("VIDEO", "video/quicktime", 20 * MB)).toBeNull();
    expect(checkUpload("PHOTO", "image/jpeg", 2 * MB)).toBeNull();
  });

  it("refuses a type that is not on the list", () => {
    expect(checkUpload("PHOTO", "image/svg+xml", 1000)?.key).toBe("errors.uploadTypeNotAllowed");
    expect(checkUpload("SELFTAPE", "application/x-msdownload", 1000)?.key).toBe(
      "errors.uploadTypeNotAllowed"
    );
    expect(checkUpload("PHOTO", "video/mp4", 1000)?.key).toBe("errors.uploadTypeNotAllowed");
  });

  it("refuses a file over the limit and says the limit in MB", () => {
    const refusal = checkUpload("SELFTAPE", "video/mp4", UPLOAD_LIMITS.SELFTAPE.maxBytes + 1);
    expect(refusal).toEqual({ key: "errors.uploadTooLarge", values: { limit: 150 } });
    expect(checkUpload("PHOTO", "image/png", 16 * MB)?.values).toEqual({ limit: 15 });
  });

  it("refuses an empty or nonsensical size", () => {
    expect(checkUpload("PHOTO", "image/png", 0)?.key).toBe("errors.uploadTooLarge");
    expect(checkUpload("PHOTO", "image/png", Number.NaN)?.key).toBe("errors.uploadTooLarge");
  });
});

describe("destinations", () => {
  it("keeps a self-tape private unless told otherwise", () => {
    expect(defaultDestination("SELFTAPE")).toBe("library");
    expect(defaultDestination("VIDEO")).toBe("profile");
    const parsed = CreateUploadInput.parse({ type: "SELFTAPE", mime: "video/mp4", sizeBytes: 10 });
    expect(parsed.destination).toBe("library");
  });

  it("lets the talent choose where a recording goes", () => {
    const parsed = CreateUploadInput.parse({
      type: "SELFTAPE",
      destination: "profile",
      mime: "video/webm;codecs=vp9",
      sizeBytes: 10,
    });
    expect(parsed).toMatchObject({ destination: "profile", mime: "video/webm" });
  });

  it("always puts a photo on the profile", () => {
    const parsed = CreateUploadInput.parse({
      type: "PHOTO",
      destination: "library",
      mime: "image/png",
      sizeBytes: 10,
    });
    expect(parsed.destination).toBe("profile");
  });

  it("refuses an unknown type or a fractional size", () => {
    expect(CreateUploadInput.safeParse({ type: "AUDIO", mime: "audio/mp3", sizeBytes: 1 }).success).toBe(false);
    expect(CreateUploadInput.safeParse({ type: "PHOTO", mime: "image/png", sizeBytes: 1.5 }).success).toBe(false);
  });
});

describe("self-tape versions", () => {
  const base = { type: "SELFTAPE", mime: "video/mp4", sizeBytes: 10 } as const;

  it("leaves the tape fields out when nothing is sent", () => {
    const parsed = CreateUploadInput.parse(base);
    expect(parsed.tapeId).toBeUndefined();
    expect(parsed.title).toBeUndefined();
    expect(parsed.demoBrief).toBeUndefined();
    expect(parsed.consentVersion).toBeUndefined();
  });

  it("trims the title, the brief and the consent version", () => {
    const parsed = CreateUploadInput.parse({
      ...base,
      tapeId: "t1",
      title: "  Monologue ",
      demoBrief: "\n Two minutes. \n",
      consentVersion: " 2026-11 ",
    });
    expect(parsed).toMatchObject({
      tapeId: "t1",
      title: "Monologue",
      demoBrief: "Two minutes.",
      consentVersion: "2026-11",
    });
  });

  it("treats blank text and null as not given", () => {
    const parsed = CreateUploadInput.parse({
      ...base,
      tapeId: null,
      title: "   ",
      demoBrief: "",
      consentVersion: null,
    });
    expect(parsed.tapeId).toBeUndefined();
    expect(parsed.title).toBeUndefined();
    expect(parsed.demoBrief).toBeUndefined();
    expect(parsed.consentVersion).toBeUndefined();
  });

  it("measures the limits after trimming: 120, 2000 and 40 characters", () => {
    const ok = CreateUploadInput.safeParse({
      ...base,
      title: ` ${"x".repeat(120)} `,
      demoBrief: "x".repeat(2000),
      consentVersion: "x".repeat(40),
    });
    expect(ok.success).toBe(true);
    expect(CreateUploadInput.safeParse({ ...base, title: "x".repeat(121) }).success).toBe(false);
    expect(CreateUploadInput.safeParse({ ...base, demoBrief: "x".repeat(2001) }).success).toBe(false);
    expect(CreateUploadInput.safeParse({ ...base, consentVersion: "x".repeat(41) }).success).toBe(false);
  });

  it("refuses a tape id that is empty, too long or not text", () => {
    expect(CreateUploadInput.safeParse({ ...base, tapeId: "" }).success).toBe(false);
    expect(CreateUploadInput.safeParse({ ...base, tapeId: "x".repeat(101) }).success).toBe(false);
    expect(CreateUploadInput.safeParse({ ...base, tapeId: 7 }).success).toBe(false);
  });

  it("drops the tape and the brief on a photo or a video, and keeps the title", () => {
    for (const type of ["PHOTO", "VIDEO"] as const) {
      const parsed = CreateUploadInput.parse({
        type,
        mime: type === "PHOTO" ? "image/png" : "video/mp4",
        sizeBytes: 10,
        tapeId: "t1",
        demoBrief: "brief",
        title: "Reel",
        consentVersion: "2026-11",
      });
      expect(parsed.tapeId).toBeUndefined();
      expect(parsed.demoBrief).toBeUndefined();
      expect(parsed).toMatchObject({ title: "Reel", consentVersion: "2026-11" });
    }
  });

  it("stores no sentence as the title of an untitled tape", () => {
    expect(UNTITLED_TAPE_TITLE).toBe("");
  });
});

describe("RenameTapeInput", () => {
  it("trims the title and keeps the brief untouched when it is left out", () => {
    const parsed = RenameTapeInput.parse({ title: "  New name " });
    expect(parsed.title).toBe("New name");
    expect(parsed.demoBrief).toBeUndefined();
  });

  it("accepts an empty title, which means untitled", () => {
    expect(RenameTapeInput.parse({ title: "  " }).title).toBe("");
  });

  it("clears the brief on null or blank text, and trims a real one", () => {
    expect(RenameTapeInput.parse({ title: "a", demoBrief: null }).demoBrief).toBeNull();
    expect(RenameTapeInput.parse({ title: "a", demoBrief: "  " }).demoBrief).toBeNull();
    expect(RenameTapeInput.parse({ title: "a", demoBrief: " To camera. " }).demoBrief).toBe("To camera.");
  });

  it("refuses a missing title and text over the limits", () => {
    expect(RenameTapeInput.safeParse({}).success).toBe(false);
    expect(RenameTapeInput.safeParse({ title: 3 }).success).toBe(false);
    expect(RenameTapeInput.safeParse({ title: "x".repeat(121) }).success).toBe(false);
    expect(RenameTapeInput.safeParse({ title: "a", demoBrief: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("toMediaStatus", () => {
  it("passes the three known states through", () => {
    expect(toMediaStatus("PROCESSING")).toBe("PROCESSING");
    expect(toMediaStatus("READY")).toBe("READY");
    expect(toMediaStatus("FAILED")).toBe("FAILED");
  });

  it("never reads an unexpected value as ready", () => {
    expect(toMediaStatus("ready")).toBe("FAILED");
    expect(toMediaStatus(undefined)).toBe("FAILED");
    expect(toMediaStatus(null)).toBe("FAILED");
  });
});

describe("CompleteUploadInput", () => {
  it("accepts studio metrics within range and refuses the rest", () => {
    const ok = CompleteUploadInput.safeParse({
      uploadId: "u1",
      durationSec: 42,
      metrics: { framing: 0.8, light: 0.6, sound: 1, durationMs: 42000 },
    });
    expect(ok.success).toBe(true);
    expect(
      CompleteUploadInput.safeParse({
        uploadId: "u1",
        metrics: { framing: 3, light: 0.6, sound: 1, durationMs: 1 },
      }).success
    ).toBe(false);
  });
});

describe("overQuota", () => {
  it("counts items and bytes", () => {
    expect(overQuota({ items: 0, totalBytes: 0 }, 10)).toBe(false);
    expect(overQuota({ items: UPLOAD_QUOTA.maxItems, totalBytes: 0 }, 10)).toBe(true);
    expect(overQuota({ items: 1, totalBytes: UPLOAD_QUOTA.maxTotalBytes - 5 }, 10)).toBe(true);
  });
});

describe("storage keys", () => {
  it("uses one folder per talent, a random name and the real extension", () => {
    expect(storageKeyFor("SELFTAPE", "p1", "abc", "video/mp4")).toBe("selftape/p1/abc.mp4");
    expect(storageKeyFor("VIDEO", "p1", "abc", "video/webm;codecs=vp9")).toBe("media/p1/abc.webm");
    expect(storageKeyFor("PHOTO", "p1", "abc", "image/jpeg")).toBe("media/p1/abc.jpg");
  });

  it("names every folder to empty when an account is deleted", () => {
    expect(storagePrefixesFor("p1")).toEqual(["media/p1/", "selftape/p1/"]);
    for (const type of ["PHOTO", "VIDEO", "SELFTAPE"] as const) {
      const key = storageKeyFor(type, "p1", "x", "video/mp4");
      expect(storagePrefixesFor("p1").some((prefix) => key.startsWith(prefix))).toBe(true);
    }
  });
});

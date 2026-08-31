import { describe, expect, it } from "vitest";
import { selectStorage, type Storage } from "@/lib/storage";
import { LocalStorage } from "@/lib/storage/local";

/**
 * The rule these pin is the one whose failure is silent and expensive: a
 * deployment that quietly writes uploads to a filesystem the host wipes. The
 * talent gets a success message, the self-tape is gone by the next deploy, and
 * nothing anywhere logs an error.
 */

const FULL = {
  R2_ACCOUNT_ID: "acct",
  R2_BUCKET: "agental-media",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
} as const;

describe("selectStorage", () => {
  it("uses R2 when all four variables are set", () => {
    const choice = selectStorage(FULL, true);
    expect(choice.kind).toBe("r2");
  });

  it("uses local disk in development when nothing is configured", () => {
    expect(selectStorage({}, false).kind).toBe("local");
  });

  it("refuses to run in production with no storage configured", () => {
    const choice = selectStorage({}, true);
    expect(choice.kind).toBe("error");
  });

  it("refuses partial configuration even in development", () => {
    // The typo case. Falling back to local disk here would look like it worked.
    const choice = selectStorage({ R2_BUCKET: "agental-media" }, false);
    expect(choice.kind).toBe("error");
    if (choice.kind !== "error") throw new Error("unreachable");
    expect(choice.missing).toContain("R2_ACCESS_KEY_ID");
    expect(choice.missing).not.toContain("R2_BUCKET");
  });

  it("names every missing variable so one round trip fixes it", () => {
    const choice = selectStorage({}, true);
    if (choice.kind !== "error") throw new Error("unreachable");
    expect(choice.missing).toHaveLength(4);
  });

  it("treats a whitespace-only value as unset", () => {
    // Pasting into a dashboard field leaves these behind more often than not.
    const choice = selectStorage({ ...FULL, R2_SECRET_ACCESS_KEY: "   " }, true);
    expect(choice.kind).toBe("error");
  });

  it("trims values rather than signing requests with a stray newline", () => {
    const choice = selectStorage({ ...FULL, R2_ACCOUNT_ID: " acct\n" }, true);
    if (choice.kind !== "r2") throw new Error("unreachable");
    expect(choice.config.R2_ACCOUNT_ID).toBe("acct");
  });
});

describe("LocalStorage", () => {
  it("does not offer signed URLs, so the media route keeps proxying in dev", () => {
    // /api/media/[id] branches on the presence of this method. If local disk
    // ever grew a no-op signedUrl, the route would redirect the browser to
    // nothing and every image in development would break.
    const local: Storage = new LocalStorage();
    expect(local.signedUrl).toBeUndefined();
  });
});

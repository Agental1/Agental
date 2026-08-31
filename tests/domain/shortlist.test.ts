import { describe, expect, it } from "vitest";
import { reconcileShortlist, talentIdOf } from "@/domain/shortlist";

/**
 * The regression these cover: re-running a brief used to delete every
 * candidature of the project and recreate them, wiping the casting director's
 * decisions. The rule is that the matcher owns NEW and SHORTLISTED; anything
 * else belongs to a human and survives a re-run.
 */

const row = (
  id: string,
  status: string,
  opts: { external?: boolean } = {}
) => ({
  id,
  status,
  artistProfileId: opts.external ? null : `talent-${id}`,
  externalTalentId: opts.external ? `talent-${id}` : null,
});

describe("talentIdOf", () => {
  it("reads the roster side", () => {
    expect(talentIdOf({ artistProfileId: "a", externalTalentId: null })).toBe("a");
  });

  it("falls back to the external side", () => {
    expect(talentIdOf({ artistProfileId: null, externalTalentId: "e" })).toBe("e");
  });

  it("returns null when both sides were cascaded away", () => {
    expect(talentIdOf({ artistProfileId: null, externalTalentId: null })).toBeNull();
  });
});

describe("reconcileShortlist", () => {
  it("drops machine-owned rows the new run no longer selects", () => {
    const existing = [row("1", "SHORTLISTED"), row("2", "NEW")];
    const { stale } = reconcileShortlist(existing, []);
    expect(stale.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("keeps every human decision, even when the talent is dropped entirely", () => {
    // The worst case, and the exact shape of the original bug: a re-run whose
    // scoring selects none of the existing talents.
    const existing = [
      row("invited", "INVITED"),
      row("contracted", "CONTRACTED"),
      row("starred", "STARRED"),
      row("excluded", "EXCLUDED"),
      row("requested", "SELFTAPE_REQUESTED"),
      row("rejected", "REJECTED"),
      row("machine", "SHORTLISTED"),
    ];
    const { stale } = reconcileShortlist(existing, []);
    expect(stale.map((r) => r.id)).toEqual(["machine"]);
  });

  it("never drops a row the new run still selects", () => {
    const existing = [row("1", "SHORTLISTED")];
    const { stale, keep } = reconcileShortlist(existing, ["talent-1"]);
    expect(stale).toEqual([]);
    expect(keep.get("talent-1")?.id).toBe("1");
  });

  it("indexes prior rows by talent so their status can be preserved", () => {
    const existing = [row("1", "INVITED"), row("2", "SHORTLISTED", { external: true })];
    const { keep } = reconcileShortlist(existing, ["talent-1", "talent-2"]);
    expect(keep.get("talent-1")?.status).toBe("INVITED");
    expect(keep.get("talent-2")?.status).toBe("SHORTLISTED");
  });

  it("ignores rows orphaned by a SetNull cascade instead of crashing", () => {
    const orphan = { id: "x", status: "SHORTLISTED", artistProfileId: null, externalTalentId: null };
    const { stale, keep } = reconcileShortlist([orphan], []);
    expect(stale).toEqual([]);
    expect(keep.size).toBe(0);
  });

  it("treats an empty project as a no-op", () => {
    const { stale, keep } = reconcileShortlist([], ["talent-1"]);
    expect(stale).toEqual([]);
    expect(keep.size).toBe(0);
  });
});

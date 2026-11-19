import { describe, expect, it, vi } from "vitest";
import { emailMatches, findUsersByEmail } from "@/lib/auth/user-by-email";

describe("emailMatches", () => {
  it("matches the address in any letter case, surrounding spaces included", () => {
    const rows = [{ id: "1", email: "Ana@Gmail.com" }, { id: "2", email: " ANA@gmail.COM " }];
    expect(emailMatches(rows, "ana@gmail.com").map((r) => r.id)).toEqual(["1", "2"]);
    expect(emailMatches(rows, " Ana@GMAIL.com").map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("puts the row stored in normal form first and keeps the others in order", () => {
    const rows = [
      { id: "old", email: "Ana@Gmail.com" },
      { id: "older", email: "ANA@GMAIL.COM" },
      { id: "normal", email: "ana@gmail.com" },
    ];
    expect(emailMatches(rows, "Ana@Gmail.com").map((r) => r.id)).toEqual(["normal", "old", "older"]);
  });

  it("drops rows that matched only through an ILIKE wildcard", () => {
    // Postgres ILIKE reads "_" as any one character and "%" as any run.
    const rows = [
      { id: "x", email: "anaXruiz@gmail.com" },
      { id: "long", email: "ana.lopez.ruiz@gmail.com" },
      { id: "real", email: "Ana_Ruiz@gmail.com" },
    ];
    expect(emailMatches(rows, "ana_ruiz@gmail.com").map((r) => r.id)).toEqual(["real"]);
    expect(emailMatches(rows, "ana%ruiz@gmail.com")).toEqual([]);
  });

  it("returns nothing when no row holds the address", () => {
    expect(emailMatches([{ id: "1", email: "bob@gmail.com" }], "ana@gmail.com")).toEqual([]);
  });
});

describe("findUsersByEmail", () => {
  it("asks for a case-insensitive match on the normalized address, oldest first", async () => {
    const findMany = vi.fn(async () => [{ id: "legacy", email: "Ana@Gmail.com" }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = await findUsersByEmail({ user: { findMany } } as any, " Ana@Gmail.COM ");
    expect(findMany).toHaveBeenCalledWith({
      where: { email: { equals: "ana@gmail.com", mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
    expect(users.map((u) => u.id)).toEqual(["legacy"]);
  });
});

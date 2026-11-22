import { describe, expect, it } from "vitest";
import { adminHostRoute, isAdminHost } from "@/domain/admin-host";

describe("admin.agental.co routing", () => {
  it("knows its hosts, with or without a port", () => {
    expect(isAdminHost("admin.agental.co")).toBe(true);
    expect(isAdminHost("ADMIN.agental.co:443")).toBe(true);
    expect(isAdminHost("admin.localhost:3200")).toBe(true);
    expect(isAdminHost("www.agental.co")).toBe(false);
    expect(isAdminHost("admin.agental.co.evil.com")).toBe(false);
  });
  it("sends the root to the hub and serves only admin and sign-in pages", () => {
    expect(adminHostRoute("/")).toEqual({ kind: "redirect", to: "/en/admin" });
    expect(adminHostRoute("/fr")).toEqual({ kind: "redirect", to: "/fr/admin" });
    for (const p of ["/en/admin", "/en/admin/comptes/abc", "/fr/connexion", "/en/mot-de-passe-oublie", "/en/reinitialiser", "/en/verifier"]) {
      expect(adminHostRoute(p)).toEqual({ kind: "allow" });
    }
    for (const p of ["/en/talents", "/en/talents/app", "/en/casting", "/en/administrator", "/en/admin-x", "/xx/admin"]) {
      expect(adminHostRoute(p)).toEqual({ kind: "notfound" });
    }
  });
});

import { safeReturnPath } from "@/domain/return-path";
describe("sign-in return to the admin", () => {
  it("allows admin pages and still refuses anything else", () => {
    expect(safeReturnPath("/en/admin")).toBe("/en/admin");
    expect(safeReturnPath("/fr/admin/comptes/abc123")).toBe("/fr/admin/comptes/abc123");
    expect(safeReturnPath("//evil.com/en/admin")).toBeNull();
    expect(safeReturnPath("/en/administrator")).toBeNull();
    expect(safeReturnPath("https://admin.agental.co/en/admin")).toBeNull();
  });
});

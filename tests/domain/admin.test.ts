import { describe, expect, it } from "vitest";
import { adminEmails, isAdminAccount } from "@/domain/admin";

/** Founders' decision 2026-11-20: contact@agental.co is the only admin in production. */
describe("isAdminAccount", () => {
  const prod = { NODE_ENV: "production" };
  it("needs the flag and, in production, contact@agental.co", () => {
    expect(isAdminAccount({ isAdmin: true, email: "contact@agental.co" }, prod)).toBe(true);
    expect(isAdminAccount({ isAdmin: true, email: "Contact@Agental.co " }, prod)).toBe(true);
    expect(isAdminAccount({ isAdmin: true, email: "someone@agental.co" }, prod)).toBe(false);
    expect(isAdminAccount({ isAdmin: false, email: "contact@agental.co" }, prod)).toBe(false);
    expect(isAdminAccount({ isAdmin: true, email: null }, prod)).toBe(false);
    expect(isAdminAccount(null, prod)).toBe(false);
  });
  it("follows ADMIN_EMAILS when set, and the flag alone outside production", () => {
    expect(adminEmails({ NODE_ENV: "production", ADMIN_EMAILS: "a@x.co, B@x.co" })).toEqual(["a@x.co", "b@x.co"]);
    expect(isAdminAccount({ isAdmin: true, email: "b@x.co" }, { ADMIN_EMAILS: "a@x.co,b@x.co" })).toBe(true);
    expect(isAdminAccount({ isAdmin: true, email: "seed@demo.test" }, { NODE_ENV: "development" })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { requiresEmailVerification } from "@/domain/email-verification";

/** Round 11: the gate follows the Admin > Controls switch only (off by default). */
const on = { gateOn: true, senderConfigured: true };
const account = (over: Partial<Parameters<typeof requiresEmailVerification>[0]> = {}) => ({
  emailVerified: null,
  passwordHash: "$2b$10$hash",
  ...over,
});

describe("requiresEmailVerification", () => {
  it("holds an unconfirmed password account while the switch is on", () => {
    expect(requiresEmailVerification(account(), on)).toBe(true);
  });

  it("lets everyone through while the switch is off, even with a sender configured", () => {
    expect(requiresEmailVerification(account(), { gateOn: false, senderConfigured: true })).toBe(false);
  });

  it("stays open while no email can be sent, even with the switch on", () => {
    expect(requiresEmailVerification(account(), { gateOn: true, senderConfigured: false })).toBe(false);
  });

  it("lets Google and Apple accounts through (no password)", () => {
    expect(requiresEmailVerification(account({ passwordHash: null }), on)).toBe(false);
  });

  it("lets a verified account through", () => {
    expect(requiresEmailVerification(account({ emailVerified: new Date() }), on)).toBe(false);
  });
});

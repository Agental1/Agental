import { describe, expect, it } from "vitest";
import { appHome, onboardingHome } from "@/domain/auth-routes";

/**
 * NextAuth redirects to these verbatim. With English only and
 * `localePrefix: "never"`, the unprefixed path is the routed URL; a prefixed
 * one would bounce through a redirect the client router does not follow.
 */
describe("appHome", () => {
  it("sends talents and casting users to their own portal", () => {
    expect(appHome("TALENT")).toBe("/talents/app");
    expect(appHome("CASTING")).toBe("/casting/app");
  });

  it("treats an unknown kind as a talent instead of throwing", () => {
    expect(appHome("")).toBe("/talents/app");
  });
});

describe("onboardingHome", () => {
  it("never returns a path the router cannot resolve", () => {
    for (const kind of ["TALENT", "CASTING"]) {
      expect(onboardingHome(kind)).toMatch(
        /^\/(talents|casting)\/inscription$/
      );
    }
  });
});

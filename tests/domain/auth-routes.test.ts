import { describe, expect, it } from "vitest";
import {
  appHome,
  isCastingOnboarded,
  isMandateSigned,
  onboardingHome,
  postAuthHome,
} from "@/domain/auth-routes";
import { routing } from "@/i18n/routing";

/**
 * The regression these pin: NextAuth was handed unprefixed targets like
 * `/talents/app`. Signing in produced a valid session and no navigation — the
 * user sat on the form as if the password had been wrong. Nothing logged an
 * error, which is why it survived a full review.
 */

describe("appHome", () => {
  it("keeps the user in the language they signed in with", () => {
    expect(appHome("TALENT", "en")).toBe("/en/talents/app");
    expect(appHome("TALENT", "es")).toBe("/es/talents/app");
  });

  it("sends casting users to their own portal", () => {
    expect(appHome("CASTING", "fr")).toBe("/fr/casting/app");
  });

  it("always carries a locale prefix, default locale included", () => {
    for (const locale of routing.locales) {
      expect(appHome("TALENT", locale)).toMatch(
        new RegExp(`^/${locale}/`)
      );
    }
  });

  it("falls back to the default locale rather than building a bogus path", () => {
    // The value arrives from a hidden form field, so it is user input on its
    // way into a redirect target.
    expect(appHome("TALENT", "de")).toBe(
      `/${routing.defaultLocale}/talents/app`
    );
    expect(appHome("TALENT", "../../evil")).toBe(
      `/${routing.defaultLocale}/talents/app`
    );
    expect(appHome("TALENT", "")).toBe(`/${routing.defaultLocale}/talents/app`);
  });

  it("treats an unknown kind as a talent instead of throwing", () => {
    expect(appHome("", "fr")).toBe("/fr/talents/app");
  });
});

describe("onboardingHome", () => {
  it("keeps a new account in the language it signed up in", () => {
    // The exact defect the project set out to fix: an English speaker who
    // switched to French the moment they created an account.
    expect(onboardingHome("TALENT", "en")).toBe("/en/talents/inscription");
    expect(onboardingHome("CASTING", "es")).toBe("/es/casting/inscription");
    expect(onboardingHome("TALENT", "zh")).toBe("/zh/talents/inscription");
  });

  it("never returns a path the router cannot resolve", () => {
    for (const locale of routing.locales) {
      for (const kind of ["TALENT", "CASTING"]) {
        expect(onboardingHome(kind, locale)).toMatch(
          /^\/(en|fr|es|zh)\/(talents|casting)\/inscription$/
        );
      }
    }
  });
});

describe("postAuthHome", () => {
  const signed = { status: "ACTIVE", signedAt: new Date("2026-01-01") };

  it("sends a talent with a signed, active mandate to the dashboard", () => {
    expect(postAuthHome("TALENT", "es", { mandat: signed })).toBe("/es/talents/app");
  });

  it("sends a talent back to onboarding until the mandate is signed and active", () => {
    expect(postAuthHome("TALENT", "fr", {})).toBe("/fr/talents/inscription");
    expect(postAuthHome("TALENT", "fr", { mandat: null })).toBe("/fr/talents/inscription");
    expect(postAuthHome("TALENT", "fr", { mandat: { status: "ACTIVE", signedAt: null } })).toBe(
      "/fr/talents/inscription"
    );
    expect(postAuthHome("TALENT", "fr", { mandat: { ...signed, status: "REVOKED" } })).toBe(
      "/fr/talents/inscription"
    );
  });

  it("sends an onboarded casting director to the dashboard", () => {
    expect(postAuthHome("CASTING", "zh", { hasOwnerMembership: true, emailVerified: true })).toBe(
      "/zh/casting/app"
    );
  });

  it("keeps a casting director in onboarding until both steps are done", () => {
    expect(postAuthHome("CASTING", "en", { hasOwnerMembership: true })).toBe("/en/casting/inscription");
    expect(postAuthHome("CASTING", "en", { emailVerified: true })).toBe("/en/casting/inscription");
  });

  it("never mixes portals: a talent's casting fields are ignored", () => {
    expect(postAuthHome("TALENT", "en", { hasOwnerMembership: true, emailVerified: true })).toBe(
      "/en/talents/inscription"
    );
  });

  it("treats a missing kind as a talent and an unknown locale as the default", () => {
    expect(postAuthHome(undefined, "../evil", {})).toBe(`/${routing.defaultLocale}/talents/inscription`);
  });
});

// The signup pages call these two directly to skip onboarding, so they must
// agree with postAuthHome on their own, not only through it.
describe("isMandateSigned", () => {
  const signedAt = new Date("2026-01-01");

  it("needs an ACTIVE mandate with a signature date", () => {
    expect(isMandateSigned({ mandat: { status: "ACTIVE", signedAt } })).toBe(true);
  });

  it("refuses a missing, unsigned or revoked mandate", () => {
    expect(isMandateSigned({})).toBe(false);
    expect(isMandateSigned({ mandat: null })).toBe(false);
    expect(isMandateSigned({ mandat: { status: "ACTIVE", signedAt: null } })).toBe(false);
    expect(isMandateSigned({ mandat: { status: "REVOKED", signedAt } })).toBe(false);
  });
});

describe("isCastingOnboarded", () => {
  it("needs both an owner membership and a verified email", () => {
    expect(isCastingOnboarded({ hasOwnerMembership: true, emailVerified: true })).toBe(true);
    expect(isCastingOnboarded({ hasOwnerMembership: true, emailVerified: false })).toBe(false);
    expect(isCastingOnboarded({ hasOwnerMembership: false, emailVerified: true })).toBe(false);
    expect(isCastingOnboarded({})).toBe(false);
  });
});

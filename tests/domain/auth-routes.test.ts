import { describe, expect, it } from "vitest";
import { appHome, onboardingHome } from "@/domain/auth-routes";
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

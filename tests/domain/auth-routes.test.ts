import { describe, expect, it } from "vitest";
import {
  appHome,
  firstRunHome,
  isCastingOnboarded,
  isMandateSigned,
  needsFirstRun,
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
  const seen = new Date("2026-01-02");

  it("sends a talent whose basics are saved to the dashboard", () => {
    expect(postAuthHome("TALENT", "es", { setupStep: null, onboardingCompletedAt: seen })).toBe(
      "/es/talents/app"
    );
  });

  it("serves the first-run screen once: profile completeness, with the tutorial flag", () => {
    const first = { setupStep: null, onboardingCompletedAt: null };
    expect(postAuthHome("TALENT", "en", first)).toBe("/en/talents/app/profil?welcome=1");
    expect(needsFirstRun("TALENT", first)).toBe(true);
    expect(needsFirstRun("TALENT", { setupStep: null, onboardingCompletedAt: seen })).toBe(false);
    expect(needsFirstRun("CASTING", { hasOwnerMembership: true })).toBe(false);
  });

  it("opens the dashboard while a setup step is missing, and stamps nothing", () => {
    // The dashboard's "Complete my profile" card names the step and resumes
    // it, on this sign-in and on every later one.
    for (const setupStep of ["identity", "profile"] as const) {
      expect(postAuthHome("TALENT", "fr", { setupStep })).toBe("/fr/talents/app");
      expect(needsFirstRun("TALENT", { setupStep })).toBe(false);
    }
    // A caller that says nothing about setup is treated as still in setup.
    expect(postAuthHome("TALENT", "fr", {})).toBe("/fr/talents/app");
    expect(needsFirstRun("TALENT", {})).toBe(false);
  });

  it("no longer reads the mandate: signed or not, the route is the same", () => {
    const signed = { status: "ACTIVE", signedAt: new Date("2026-01-01") };
    for (const mandat of [signed, { ...signed, status: "REVOKED" }, null, undefined]) {
      expect(postAuthHome("TALENT", "en", { mandat, setupStep: null, onboardingCompletedAt: seen })).toBe(
        "/en/talents/app"
      );
      expect(postAuthHome("TALENT", "en", { mandat, setupStep: "profile" })).toBe("/en/talents/app");
    }
    // A mandate signed before the beta does not stand in for the basics.
    expect(needsFirstRun("TALENT", { mandat: signed })).toBe(false);
  });

  it("sends an onboarded casting director to the dashboard", () => {
    expect(
      postAuthHome("CASTING", "zh", { hasOwnerMembership: true, onboardingCompletedAt: seen })
    ).toBe("/zh/casting/app");
  });

  it("keeps a casting director in onboarding until both steps are done", () => {
    expect(postAuthHome("CASTING", "en", { hasOwnerMembership: true })).toBe("/en/casting/inscription");
    expect(postAuthHome("CASTING", "en", { onboardingCompletedAt: seen })).toBe(
      "/en/casting/inscription"
    );
  });

  it("never mixes portals: a talent's casting fields are ignored", () => {
    expect(
      postAuthHome("TALENT", "en", { hasOwnerMembership: true, onboardingCompletedAt: seen })
    ).toBe("/en/talents/app");
    expect(
      postAuthHome("CASTING", "en", { setupStep: null, onboardingCompletedAt: null })
    ).toBe("/en/casting/inscription");
  });

  it("treats a missing kind as a talent and an unknown locale as the default", () => {
    expect(postAuthHome(undefined, "../evil", {})).toBe(`/${routing.defaultLocale}/talents/app`);
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
  const stamped = new Date("2026-01-02");

  it("needs both an owner membership and the wizard's final stamp", () => {
    expect(isCastingOnboarded({ hasOwnerMembership: true, onboardingCompletedAt: stamped })).toBe(true);
    expect(isCastingOnboarded({ hasOwnerMembership: true, onboardingCompletedAt: null })).toBe(false);
    expect(isCastingOnboarded({ hasOwnerMembership: false, onboardingCompletedAt: stamped })).toBe(false);
    expect(isCastingOnboarded({})).toBe(false);
  });
});

describe("firstRunHome", () => {
  it("is locale-prefixed and carries the tutorial flag", () => {
    expect(firstRunHome("TALENT", "fr")).toBe("/fr/talents/app/profil?welcome=1");
    expect(firstRunHome("CASTING", "en")).toBe("/en/casting/app?welcome=1");
    expect(firstRunHome("TALENT", "../evil")).toBe(`/${routing.defaultLocale}/talents/app/profil?welcome=1`);
  });
});

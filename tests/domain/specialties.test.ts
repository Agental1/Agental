import { describe, expect, it } from "vitest";
import { SpecialtyKind } from "@/domain/enums";
import { CASTING_TYPE_SLUGS } from "@/data/casting-types";

/**
 * The repo carries TWO lists of casting disciplines and nothing links them:
 *
 *   - `CASTING_TYPE_SLUGS` drives the public SEO landings and the sitemap.
 *   - `SpecialtyKind` is what a talent can tick at signup. `TalentOnboardingInput`
 *     validates against it and the onboarding wizard renders its `.options`.
 *
 * Adding a slug to the first without the second ships an indexed page selling a
 * discipline the signup form then refuses. That already happened on this branch:
 * `/castings/performeurs` went live before `SpecialtyKind` knew the word, and a
 * human review caught it rather than a test. This is that test.
 */

/**
 * The one sanctioned divergence, kept because the slug is a live indexed URL and
 * the enum value is persisted in the `Specialty` rows of existing profiles:
 * renaming either side costs more than the asymmetry does. Both render the same
 * label (`app.specialties.voix`).
 */
const SLUG_TO_KIND: Record<string, string> = { "voix-doublage": "voix" };

const normalise = (slug: string) => SLUG_TO_KIND[slug] ?? slug;

describe("SpecialtyKind ↔ CASTING_TYPE_SLUGS", () => {
  it("offers a signup specialty for every public landing", () => {
    const kinds = new Set<string>(SpecialtyKind.options);
    const missing = CASTING_TYPE_SLUGS.map(normalise).filter(
      (kind) => !kinds.has(kind)
    );
    expect(missing).toEqual([]);
  });

  it("has no signup specialty without a landing to send people to", () => {
    const fromSlugs = new Set(CASTING_TYPE_SLUGS.map(normalise));
    const orphans = SpecialtyKind.options.filter((k) => !fromSlugs.has(k));
    expect(orphans).toEqual([]);
  });

  it("keeps voix-doublage as the ONLY name that differs between the two", () => {
    // If a second alias ever appears, it should be a deliberate decision with a
    // line in this map — not something that quietly accumulates.
    const differing = CASTING_TYPE_SLUGS.filter(
      (slug) => normalise(slug) !== slug
    );
    expect(differing).toEqual(["voix-doublage"]);
  });
});

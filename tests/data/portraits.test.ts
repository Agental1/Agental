import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PORTRAITS } from "@/data/portraits";
import { CASTING_TYPES } from "@/data/casting-types";
import { routing } from "@/i18n/routing";

/**
 * The hero collage walks two arrays in lockstep: `PORTRAITS[locale].hero` drives
 * the loop and `talents.hero.collage[i]` supplies the caption beside each face.
 * Nothing in the type system couples their lengths, and `i18n:check` only
 * compares locales against each other — it has no idea how many images exist.
 *
 * Two ways this breaks silently, both caught here:
 *   - lengths drift, and a face ships with an empty caption;
 *   - the key goes missing, and `t.raw` returns the key PATH as a string, so
 *     indexing it yields one-letter captions with no error anywhere.
 */
function captionsFor(locale: string): unknown {
  const messages = JSON.parse(
    readFileSync(`messages/${locale}/talents.json`, "utf8")
  );
  return messages.hero?.collage;
}

describe("hero portraits", () => {
  for (const locale of routing.locales) {
    it(`${locale}: one caption per face, and they are real strings`, () => {
      const captions = captionsFor(locale);
      expect(Array.isArray(captions)).toBe(true);
      expect(captions).toHaveLength(PORTRAITS[locale].hero.length);
      for (const caption of captions as unknown[]) {
        expect(typeof caption).toBe("string");
        // A key-path fallback would pass a length check on a short string; a
        // real caption is longer than a stray character.
        expect((caption as string).length).toBeGreaterThan(3);
      }
    });
  }
});

describe("age-band portraits", () => {
  for (const locale of routing.locales) {
    it(`${locale}: every casting type resolves to an image`, () => {
      for (const type of CASTING_TYPES) {
        expect(
          PORTRAITS[locale].ages[type.ageBand],
          `${locale} / ${type.slug} → ${type.ageBand}`
        ).toBeTruthy();
      }
    });
  }
});

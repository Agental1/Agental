import { describe, expect, it } from "vitest";
import { fromAcceptLanguage, fromCountry, pickLocale } from "@/domain/locale-negotiation";
import { LOCALES_SORTED, localeLabel, routing } from "@/i18n/routing";

describe("first-visit language (round 11)", () => {
  it("a saved choice (cookie) always wins", () => {
    expect(pickLocale({ cookie: "ko", acceptLanguage: "fr-FR,fr;q=0.9", country: "JP" })).toBe("ko");
  });

  it("then the browser or phone language, by preference", () => {
    expect(pickLocale({ acceptLanguage: "pt-BR,pt;q=0.9,en;q=0.8", country: "US" })).toBe("pt");
    expect(pickLocale({ acceptLanguage: "de-DE,it;q=0.7,en;q=0.5" })).toBe("it");
    expect(pickLocale({ acceptLanguage: "en;q=0.4,ja;q=0.9" })).toBe("ja");
    expect(pickLocale({ acceptLanguage: "zh-TW,zh;q=0.9", country: "US" })).toBe("zh");
  });

  it("then the country of the IP when no browser language is supported", () => {
    expect(pickLocale({ acceptLanguage: "de-DE,de;q=0.9", country: "BR" })).toBe("pt");
    expect(pickLocale({ acceptLanguage: "ru", country: "kr" })).toBe("ko");
    expect(pickLocale({ acceptLanguage: null, country: "MX" })).toBe("es");
  });

  it("then English", () => {
    expect(pickLocale({ acceptLanguage: "de-DE", country: "DE" })).toBe("en");
    expect(pickLocale({})).toBe("en");
    expect(pickLocale({ cookie: "ar", acceptLanguage: "ar", country: "SA" })).toBe("en");
  });

  it("ignores weights of zero and wildcards", () => {
    expect(fromAcceptLanguage("ja;q=0, *;q=0.5")).toBeNull();
    expect(fromCountry("US")).toBeNull();
  });

  it("lists the eight languages alphabetically by English name, in their own name first", () => {
    expect(routing.locales).toHaveLength(8);
    expect(LOCALES_SORTED.map(localeLabel)).toEqual([
      "中文 (Chinese)",
      "English",
      "Français (French)",
      "Italiano (Italian)",
      "日本語 (Japanese)",
      "한국어 (Korean)",
      "Português (Portuguese)",
      "Español (Spanish)",
    ]);
  });
});

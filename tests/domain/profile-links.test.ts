import { describe, expect, it } from "vitest";
import { ProfileLinks, normalizeImdbUrl, normalizePortfolioUrl } from "@/domain/profile-links";

describe("normalizeImdbUrl", () => {
  it("accepts imdb.com/name links, with or without scheme and www", () => {
    for (const v of [
      "imdb.com/name/nm1234567",
      "https://www.imdb.com/name/nm1234567/",
      "http://m.imdb.com/name/nm1234567/?ref_=x",
    ])
      expect(normalizeImdbUrl(v)).toBe("https://www.imdb.com/name/nm1234567/");
  });

  it("refuses anything else", () => {
    for (const v of [
      "https://imdb.com/title/tt0111161/",
      "https://notimdb.com/name/nm1234567/",
      "https://imdb.com.evil.test/name/nm1234567/",
      "javascript:alert(1)",
      "https://example.com",
    ])
      expect(normalizeImdbUrl(v)).toBeNull();
  });
});

describe("normalizePortfolioUrl", () => {
  it("accepts https URLs and completes a bare domain", () => {
    expect(normalizePortfolioUrl("https://ana.example.com/work")).toBe("https://ana.example.com/work");
    expect(normalizePortfolioUrl("ana.example.com")).toBe("https://ana.example.com/");
  });

  it("refuses http, other schemes and credentials", () => {
    for (const v of ["http://ana.example.com", "ftp://x.com", "javascript:alert(1)", "https://u:p@x.com", "localhost"])
      expect(normalizePortfolioUrl(v)).toBeNull();
  });
});

describe("ProfileLinks", () => {
  it("turns an empty string into null and keeps valid links", () => {
    const r = ProfileLinks.parse({ imdbUrl: "", portfolioUrl: "ana.example.com" });
    expect(r).toEqual({ imdbUrl: null, portfolioUrl: "https://ana.example.com/" });
  });

  it("reports the error key of the first bad link", () => {
    const r = ProfileLinks.safeParse({ imdbUrl: "https://example.com", portfolioUrl: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("errors.imdbUrl");
  });
});

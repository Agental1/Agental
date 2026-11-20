import { describe, expect, it } from "vitest";
import { isSchoolEmail, SchoolEmail } from "@/domain/student";
import { initialsOf, sniffImage } from "@/domain/avatar";
import { safeReturnPath } from "@/domain/return-path";

describe("school emails", () => {
  it("accepts .edu addresses, subdomains included", () => {
    expect(isSchoolEmail("ana@usc.edu")).toBe(true);
    expect(isSchoolEmail("ana@cs.stanford.edu")).toBe(true);
  });
  it("refuses everything else", () => {
    for (const e of ["ana@gmail.com", "ana@edu", "ana@usc.edu.evil.com", "ana@.edu", "ana@usc..edu", "noat.edu"])
      expect(isSchoolEmail(e)).toBe(false);
  });
  it("normalizes case and spaces", () => {
    expect(SchoolEmail.parse("  Ana@USC.EDU ")).toBe("ana@usc.edu");
  });
});

describe("avatar", () => {
  it("knows images by their bytes, not their name", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
  it("draws two initials", () => {
    expect(initialsOf("Maya Okafor")).toBe("MO");
    expect(initialsOf("", "yann.legoff@x.co")).toBe("YL");
    expect(initialsOf(null, null)).toBe("?");
  });
});

describe("sign-in return path", () => {
  it("allows app pages only", () => {
    expect(safeReturnPath("/en/talents/app/reel-self-tape?restore=1")).toBe("/en/talents/app/reel-self-tape?restore=1");
    expect(safeReturnPath("/fr/talents/app")).toBe("/fr/talents/app");
  });
  it("refuses anything that could leave the site", () => {
    for (const p of ["//evil.com", "https://evil.com/en/talents/app", "/en/talents/app/../../x", "/en/talents/app?next=//x", "/en", "/de/talents/app", 42, null])
      expect(safeReturnPath(p)).toBeNull();
  });
});

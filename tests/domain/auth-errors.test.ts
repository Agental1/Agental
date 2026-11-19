import { describe, expect, it } from "vitest";
import { authErrorKey } from "@/domain/auth-errors";
import appMessages from "../../messages/en/app.json";

describe("authErrorKey", () => {
  it("shows nothing without an error", () => {
    expect(authErrorKey(undefined)).toBeNull();
    expect(authErrorKey("")).toBeNull();
  });

  it("maps every allowed code to an existing message", () => {
    for (const code of [
      "oauthNoAccount",
      "oauthEmailUnverified",
      "oauthLinkRequiresPassword",
      "oauthGeneric",
      "adultsOnly",
    ]) {
      const key = authErrorKey(code);
      expect(key).toBe(`errors.${code}`);
      expect(appMessages.errors).toHaveProperty(code);
    }
  });

  it("maps Auth.js codes and anything hand-edited to the generic message", () => {
    for (const code of ["AccessDenied", "Configuration", "<script>", "toString", "__proto__"]) {
      expect(authErrorKey(code)).toBe("errors.oauthGeneric");
    }
  });

  it("reads the first value of a repeated parameter", () => {
    expect(authErrorKey(["adultsOnly", "oauthGeneric"])).toBe("errors.adultsOnly");
  });
});

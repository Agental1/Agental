import { describe, expect, it } from "vitest";
import { LoginInput, NewPassword, passwordChecks, SignupInput } from "@/domain/auth";

describe("email normalization", () => {
  it("trims and lowercases at signup", () => {
    const parsed = SignupInput.parse({ email: "  Ana@Example.COM ", password: "Curtain-Call9", kind: "TALENT" });
    expect(parsed.email).toBe("ana@example.com");
  });

  it("trims and lowercases at login, so the lookup matches", () => {
    expect(LoginInput.parse({ email: "Ana@Example.com ", password: "x" }).email).toBe("ana@example.com");
  });

  it("still refuses an invalid email with its key", () => {
    const result = SignupInput.safeParse({ email: "nope", password: "Curtain-Call9", kind: "TALENT" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("errors.emailInvalid");
  });
});

describe("new password rules", () => {
  const firstError = (password: string) =>
    NewPassword.safeParse(password).error?.issues[0].message;

  it("accepts 8+ characters with an uppercase letter and a special character", () => {
    expect(NewPassword.safeParse("Curtain-Call9").success).toBe(true);
    expect(NewPassword.safeParse("Écran_noir").success).toBe(true);
  });

  it("reports the first failed rule as a translation key", () => {
    expect(firstError("Ab!")).toBe("errors.passwordTooShort");
    expect(firstError("curtain-call9")).toBe("errors.passwordNeedsUppercase");
    expect(firstError("CurtainCall9")).toBe("errors.passwordNeedsSpecial");
  });

  it("does not count letters, digits or spaces as special", () => {
    expect(passwordChecks("Curtain Call 9é").special).toBe(false);
    expect(passwordChecks("Curtain_Call").special).toBe(true);
  });

  it("gives the form one flag per rule", () => {
    expect(passwordChecks("")).toEqual({ length: false, uppercase: false, special: false });
    expect(passwordChecks("abcdefgh")).toEqual({ length: true, uppercase: false, special: false });
    expect(passwordChecks("Curtain-Call9")).toEqual({ length: true, uppercase: true, special: true });
  });

  it("is enforced at signup and left out of login", () => {
    const signup = SignupInput.safeParse({ email: "ana@example.com", password: "password1", kind: "TALENT" });
    expect(signup.error?.issues[0].message).toBe("errors.passwordNeedsUppercase");
    expect(LoginInput.safeParse({ email: "ana@example.com", password: "password1" }).success).toBe(true);
  });
});

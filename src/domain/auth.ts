import { z } from "zod";
import { UserKind } from "./enums";

/**
 * Emails are trimmed and lowercased before validation and before every lookup.
 * Providers lowercase theirs, and User.email is unique byte for byte, so
 * "Ana@X.com" and "ana@x.com" would otherwise be two accounts.
 */
const Email = (message?: string) =>
  z.string().trim().toLowerCase().email(message);

/**
 * Password rules for a new password, in the order they are reported. One list
 * feeds both sides: the sign-up form shows it as a live checklist
 * (passwordChecks) and the server refuses anything that fails it (NewPassword).
 * Signing in never applies them, so older passwords keep working.
 *
 * "Special" means anything that is neither a letter, a digit nor a space, in
 * any script, so "é" is a letter and "!" or "_" is special.
 */
export const PASSWORD_RULES = [
  {
    id: "length",
    error: "errors.passwordTooShort",
    test: (password: string) => password.length >= 8,
  },
  {
    id: "uppercase",
    error: "errors.passwordNeedsUppercase",
    test: (password: string) => /\p{Lu}/u.test(password),
  },
  {
    id: "special",
    error: "errors.passwordNeedsSpecial",
    test: (password: string) => /[^\p{L}\p{N}\s]/u.test(password),
  },
] as const;

export type PasswordRuleId = (typeof PASSWORD_RULES)[number]["id"];

/** Which rules a candidate password meets, for the form's checklist. */
export function passwordChecks(password: string): Record<PasswordRuleId, boolean> {
  return {
    length: PASSWORD_RULES[0].test(password),
    uppercase: PASSWORD_RULES[1].test(password),
    special: PASSWORD_RULES[2].test(password),
  };
}

/** A new password: reports the first rule it fails, as a translation key. */
export const NewPassword = z.string().superRefine((password, ctx) => {
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  if (failed) ctx.addIssue({ code: "custom", message: failed.error });
});

export const SignupInput = z.object({
  email: Email("errors.emailInvalid"),
  password: NewPassword,
  kind: UserKind,
  locale: z.string().default("en"),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: Email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

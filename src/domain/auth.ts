import { z } from "zod";
import { UserKind } from "./enums";

export const SignupInput = z.object({
  email: z.string().email("errors.emailInvalid"),
  password: z.string().min(8, "errors.passwordTooShort"),
  kind: UserKind,
  locale: z.string().default("en"),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

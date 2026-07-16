import { z } from "zod";
import { UserKind } from "./enums";

export const SignupInput = z.object({
  email: z.string().email("Adresse email invalide."),
  password: z.string().min(8, "8 caractères minimum."),
  kind: UserKind,
  locale: z.string().default("fr"),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

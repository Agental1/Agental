"use client";

import { useActionErrorText } from "@/components/app/action-error";
import type { Locale } from "next-intl";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AuthState } from "@/app/actions/auth";

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

export function AuthForm({
  action,
  submitLabel,
  kind,
  locale,
  showName = false,
}: {
  action: Action;
  submitLabel: string;
  kind?: "TALENT" | "CASTING";
  locale: Locale;
  showName?: boolean;
}) {
  const t = useTranslations("app");
  const errorText = useActionErrorText();
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      {kind && <input type="hidden" name="kind" value={kind} />}
      <input type="hidden" name="locale" value={locale} />

      {showName && (
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("auth.name")}</Label>
          <Input id="name" name="name" autoComplete="name" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={kind ? "new-password" : "current-password"}
          minLength={8}
          placeholder={t("auth.passwordPlaceholder")}
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-sedan bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {errorText(state.error)}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

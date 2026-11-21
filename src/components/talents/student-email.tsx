"use client";

import { useActionState, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Link } from "@/i18n/navigation";
import {
  confirmStudentEmailAction,
  requestStudentEmail,
  type ConfirmStudentState,
  type StudentEmailState,
} from "@/app/actions/student-email";

/** Subscription: "College student? Verify your school email." */
export function StudentEmailCard({
  verifiedEmail,
  discountPercent,
}: {
  verifiedEmail: string | null;
  discountPercent: number | null;
}) {
  const t = useTranslations("talents.space.student");
  const locale = useLocale();
  const id = useId();
  const [state, action, pending] = useActionState<StudentEmailState, FormData>(requestStudentEmail, undefined);
  // Controlled: React resets a form after an action, which wiped the address on an error.
  const [email, setEmail] = useState("");

  return (
    <section
      id="student"
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-sedan-xl border border-border bg-surface p-5"
    >
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-[1.125rem] font-bold">
        <GraduationCap aria-hidden="true" className="size-5 text-accent" />
        {t("title")}
      </h2>
      {verifiedEmail ? (
        <div className="mt-2 space-y-1 text-[15px]">
          <p className="font-medium text-success">{t("verified", { email: verifiedEmail })}</p>
          <p className="text-fg-muted">
            {discountPercent != null ? t("percent", { percent: discountPercent }) : t("pending")}
          </p>
        </div>
      ) : state?.ok ? (
        <p role="status" className="mt-2 text-[15px]">
          {state.delivered ? t("sent", { email: state.email }) : t("notSent")}
        </p>
      ) : (
        <form action={action} className="mt-2 space-y-3" noValidate>
          <p className="text-[15px] text-fg-muted">{t("lead")}</p>
          <input type="hidden" name="locale" value={locale} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor={`${id}-email`}>{t("label")}</Label>
              <Input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t("placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" loading={pending}>
              {t("submit")}
            </Button>
          </div>
          <ActionErrorMessage error={state && !state.ok ? state.error : undefined} />
        </form>
      )}
    </section>
  );
}

/** The landing of the link in the email: one button confirms. */
export function ConfirmStudentEmail({ token }: { token: string }) {
  const t = useTranslations("talents.space.student");
  const tc = useTranslations("app.actions");
  const [state, action, pending] = useActionState<ConfirmStudentState, FormData>(
    confirmStudentEmailAction,
    undefined
  );
  if (state) {
    const text = state.ok
      ? t("confirmed", { email: state.email })
      : state.reason === "expired"
        ? t("confirmExpired")
        : state.reason === "taken"
          ? t("confirmTaken")
          : t("confirmInvalid");
    return (
      <div role="status" className="space-y-4 text-center">
        <p className={state.ok ? "font-medium" : "text-danger"}>{text}</p>
        <Button asChild>
          <Link href="/talents/app/abonnement#student">{t("back")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4 text-center">
      <input type="hidden" name="token" value={token} />
      <p className="text-fg-muted">{t("lead")}</p>
      <Button type="submit" size="lg" loading={pending}>
        {tc("confirm")}
      </Button>
    </form>
  );
}

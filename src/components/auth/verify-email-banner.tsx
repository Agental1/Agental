"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MailWarning } from "lucide-react";
import { requestEmailVerification } from "@/app/actions/account-email";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";

/** "Verify your email" for accounts created before verification was required. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useTranslations("common.emailFlow");
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  return (
    <div
      role="region"
      aria-label={t("bannerTitle")}
      className="mb-5 flex flex-wrap items-center gap-3 rounded-sedan border border-border bg-accent-soft/40 px-4 py-3 text-[14.5px]"
    >
      <MailWarning aria-hidden="true" className="size-5 shrink-0 text-accent" />
      <p className="min-w-0 flex-1">
        <span className="font-bold">{t("bannerTitle")}</span>{" "}
        {sent ? t("resent") : t("bannerBody", { email })}
      </p>
      <button
        type="button"
        disabled={pending || cooldown > 0}
        onClick={() => {
          setError(undefined);
          start(async () => {
            const res = await requestEmailVerification().catch(() => ({ ok: false as const, error: err("errors.generic") }));
            if (!res.ok) return setError(res.error ?? err("errors.generic"));
            setSent(true);
            setCooldown(60);
          });
        }}
        className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline disabled:text-fg-muted disabled:no-underline"
      >
        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("bannerResend")}
      </button>
      <ActionErrorMessage error={error} className="w-full" />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { acceptLegalDocuments } from "@/app/actions/legal";
import { logoutAction } from "@/app/actions/auth";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
import { err, type ActionError } from "@/domain/action-result";
import { PRIVACY_SECURITY_ANCHOR } from "@/domain/legal-versions";

/**
 * Round 11, group 3: shown once, in place of the app, to an account that has
 * not accepted the current Privacy Policy (accounts created before round 11,
 * Google sign-ups). One box, one button; the date and version are recorded.
 */
export function AcceptPrivacyScreen({ termsEnabled = false }: { termsEnabled?: boolean }) {
  const t = useTranslations("common.legalAccept");
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  function accept() {
    setError(undefined);
    start(async () => {
      const res = await acceptLegalDocuments(agreed).catch(() => ({ ok: false as const, error: err("errors.generic") }));
      if (res.ok) return router.refresh();
      setError(res.error);
    });
  }

  const link = (href: string) =>
    function PolicyLink(chunks: React.ReactNode) {
      return (
        <Link href={href} target="_blank" className="font-bold text-accent underline underline-offset-4">
          {chunks}
        </Link>
      );
    };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 pt-16 pb-[50svh] sm:pb-16">
      <div className="space-y-5 rounded-sedan-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="space-y-2">
          <ShieldCheck aria-hidden="true" className="size-7 text-accent" />
          <h1 className="text-2xl">{t("title")}</h1>
          <p className="text-[15px] leading-relaxed text-fg-muted">{t("lead")}</p>
          <p className="text-[15px] leading-relaxed text-fg-muted">
            {t.rich("security", { security: link(`/talents/confidentialite#${PRIVACY_SECURITY_ANCHOR}`) })}
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <input
            id="legal-accept"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
          />
          <label htmlFor="legal-accept" className="text-[14.5px] leading-snug">
            {t.rich(termsEnabled ? "agreePrivacyTerms" : "agreePrivacy", {
              privacy: link("/talents/confidentialite"),
              terms: link("/talents/conditions"),
            })}
          </label>
        </div>
        <ActionErrorMessage error={error} />
        <Button className="w-full" onClick={accept} loading={pending} disabled={!agreed}>
          {t("continue")}
        </Button>
        <p className="text-center text-[13.5px] text-fg-muted">{t("deleteInstead")}</p>
        <form action={logoutAction} className="text-center">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center text-[14px] text-fg-muted underline-offset-4 hover:underline"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
    </main>
  );
}

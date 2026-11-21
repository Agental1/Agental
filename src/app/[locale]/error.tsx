"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Recoverable error boundary for everything under [locale].
 *
 * It sits inside NextIntlClientProvider, so it can speak the visitor's
 * language. Its sibling app/global-error.tsx cannot: that one replaces the root
 * layout entirely, which means no provider, no fonts and no portal skin — see
 * the comment there.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  useEffect(() => {
    // The digest is the only handle on the server-side stack in production.
    console.error("[error boundary]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div
      data-portal="talents"
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center text-fg"
    >
      <AgentalMark className="h-20 w-auto text-fg" />
      <h1 className="mt-6 font-display text-3xl font-medium tracking-tight">
        {t("error.title")}
      </h1>
      <p className="mt-3 max-w-md text-fg-muted">{t("error.body")}</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={reset}>
          <RotateCcw /> {t("error.retry")}
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/talents">{t("error.backHome")}</Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-6 text-xs text-fg-subtle">{error.digest}</p>
      )}
    </div>
  );
}

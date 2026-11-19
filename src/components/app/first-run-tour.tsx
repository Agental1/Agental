"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Portal } from "@/lib/utils";

export interface TourStep {
  title: string;
  body: string;
  /** The page this step is about, and its name in the menu. */
  href: string;
  page: string;
}

/**
 * "How this works": the short tour shown on the first sign-in.
 *
 * It opens when the URL carries `?welcome=1`, which is where the server sends
 * a brand-new account (and what "Replay the tour" in Settings links to), so it
 * shows once and can be replayed on purpose. Closing it removes the parameter.
 * The steps are numbered because the tour is a sequence.
 *
 * TODO(backend): call `completeFirstRun()` (src/app/actions/onboarding.ts) on
 * close once feat/round2-server lands, so the flag is stamped even if the
 * person never reaches the last step.
 */
export function FirstRunTour({ portal, steps }: { portal: Portal; steps: TourStep[] }) {
  const t = useTranslations("common.tour");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const open = params.get("welcome") === "1" && !dismissed && steps.length > 0;
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  function close() {
    setDismissed(true);
    setIndex(0);
    router.replace(pathname, { scroll: false });
  }

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent data-portal={portal} className="w-[calc(100%-1.5rem)] max-w-lg bg-none">
        <p className="flex items-baseline gap-3 pr-10 text-[14px]">
          <span className="font-bold text-accent">{t("start")}</span>
          <span className="text-fg-muted">{t("step", { n: index + 1, total: steps.length })}</span>
        </p>
        <DialogTitle className="mt-2 text-[1.5rem] font-bold leading-tight">{step.title}</DialogTitle>
        <DialogDescription className="mt-2 text-[16px] leading-relaxed">{step.body}</DialogDescription>

        <ol aria-hidden="true" className="mt-5 flex gap-1.5">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={i <= index ? "h-1.5 flex-1 rounded-full bg-accent" : "h-1.5 flex-1 rounded-full bg-surface-2"}
            />
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={step.href}
            onClick={() => setDismissed(true)}
            className="inline-flex min-h-11 items-center text-[14px] font-bold text-accent underline-offset-4 hover:underline"
          >
            {t("open", { page: step.page })}
          </Link>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <Button variant="secondary" className="border-border-strong" onClick={() => setIndex(index - 1)}>
                {t("back")}
              </Button>
            ) : (
              <Button variant="ghost" onClick={close}>
                {t("skip")}
              </Button>
            )}
            <Button onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

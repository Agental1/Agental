"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { ConsentChoice } from "./consent-choice";

/**
 * "Cookie preferences" in Settings: the same choice as at sign-up, changeable
 * at any time.
 *
 * TODO(backend): also call `saveConsent` (src/app/actions/consent.ts) and
 * start from `getConsent()` once feat/round2-server lands; today the choice
 * lives in the first-party cookie.
 */
export function ConsentSettings() {
  const t = useTranslations("common.consent");
  const [saved, setSaved] = useState(false);
  return (
    <section className="rounded-sedan-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-[1.125rem]">
        <Cookie aria-hidden="true" className="size-5 text-accent" />
        {t("settingsTitle")}
      </h2>
      <p className="mt-1 max-w-[60ch] text-[15px] text-fg-muted">{t("lead")}</p>
      <ConsentChoice className="mt-4" onChosen={() => setSaved(true)} />
      <p role="status" className="mt-3 min-h-5 text-[14px] font-bold text-success">
        {saved ? t("saved") : ""}
      </p>
    </section>
  );
}

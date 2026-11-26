import { useLocale, useTranslations } from "next-intl";
import { legalCopyParams } from "@/lib/legal-copy";

/**
 * "Two separate things": representation (free) and tools (optional), plus the
 * human in the loop. Every sentence is a `common.legalCopy.*` key, the single
 * source in docs/LEGAL_COPY.md, so this block cannot drift from the other pages.
 */
export function TwoThings({ className }: { className?: string }) {
  const t = useTranslations("common.legalCopy");
  const params = legalCopyParams(useLocale());
  return (
    <section id="two-things" aria-labelledby="two-things-title" className={className}>
      <h2 id="two-things-title" className="text-xl font-bold tracking-[-0.01em]">
        {t("twoThingsTitle")}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-sedan-xl border border-border bg-surface p-5">
          <h3 className="font-bold">{t("repTitle")}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t("repFree", params)}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t("repTerms", params)}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t("repPartner")}</p>
        </div>
        <div className="rounded-sedan-xl border border-border bg-surface p-5">
          <h3 className="font-bold">{t("toolsTitle")}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t("toolsBody")}</p>
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{t("humanLoop")}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-fg-subtle">{t("beta")}</p>
    </section>
  );
}

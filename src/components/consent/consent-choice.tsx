"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NECESSARY_ONLY, readConsent, writeConsent, type Consent } from "./consent-cookie";

/**
 * The cookie choice: every category listed, three ways to answer.
 *
 * "Accept all" is the primary button; "Reject non-essential" and "Manage
 * preferences" sit beside it at the same size, so refusing takes one click,
 * exactly like accepting. Only strictly necessary cookies are on by default.
 *
 * `onChosen` runs after the choice is written; the sign-up form uses it to
 * create the account, Settings uses it to confirm the save.
 */
export function ConsentChoice({
  onChosen,
  submit = false,
  className,
}: {
  onChosen?: (consent: Consent) => void;
  /** Render the answer buttons as submit buttons (inside the sign-up form). */
  submit?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.consent");
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<Consent>(() => readConsent() ?? NECESSARY_ONLY);

  function choose(consent: Consent) {
    writeConsent(consent);
    onChosen?.(consent);
  }

  const type = submit ? "submit" : "button";
  const categories = [
    { key: "necessary", locked: true },
    { key: "analytics", locked: false },
    { key: "marketing", locked: false },
  ] as const;

  return (
    <div className={cn("space-y-4", className)}>
      <ul className="space-y-2">
        {categories.map((cat) => (
          <li
            key={cat.key}
            className="flex items-start justify-between gap-4 rounded-sedan border border-border bg-surface px-4 py-3"
          >
            <span className="block">
              <span className="block font-bold leading-snug">{t(cat.key)}</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-fg-muted">{t(`${cat.key}Body`)}</span>
            </span>
            {cat.locked ? (
              <span className="shrink-0 pt-0.5 text-[13px] font-bold text-fg-muted">{t("alwaysOn")}</span>
            ) : managing ? (
              <input
                type="checkbox"
                aria-label={t(cat.key)}
                checked={draft[cat.key]}
                onChange={(e) => setDraft({ ...draft, [cat.key]: e.target.checked })}
                className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
              />
            ) : null}
          </li>
        ))}
      </ul>

      {managing ? (
        <Button type={type} className="w-full" onClick={() => choose(draft)}>
          {t("saveChoice")}
        </Button>
      ) : (
        <div className="grid gap-2">
          <Button type={type} onClick={() => choose({ analytics: true, marketing: true })}>
            {t("acceptAll")}
          </Button>
          <Button type={type} variant="secondary" className="border-border-strong" onClick={() => choose(NECESSARY_ONLY)}>
            {t("reject")}
          </Button>
          <Button type="button" variant="secondary" className="border-border-strong" onClick={() => setManaging(true)}>
            {t("manage")}
          </Button>
        </div>
      )}
    </div>
  );
}

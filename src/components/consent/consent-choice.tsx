"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  initial,
  writeCookie = true,
  busy = false,
  submit = false,
  className,
}: {
  onChosen?: (consent: Consent) => void;
  /** The choice to start from. Defaults to this browser's cookie. */
  initial?: Consent | null;
  /**
   * Write the choice to the cookie before calling onChosen. Settings turns
   * this off and writes it itself once the account has saved it.
   */
  writeCookie?: boolean;
  /**
   * While a choice is being saved. The buttons stay enabled so keyboard focus
   * stays on them (a focused button that becomes disabled drops focus to the
   * page); they are marked aria-disabled and presses are ignored.
   */
  busy?: boolean;
  /** Render the answer buttons as submit buttons (inside the sign-up form). */
  submit?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.consent");
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<Consent>(() => initial ?? readConsent() ?? NECESSARY_ONLY);

  function choose(consent: Consent) {
    if (busy) return;
    if (writeCookie) writeConsent(consent);
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
              <Switch
                aria-label={t(cat.key)}
                checked={draft[cat.key]}
                onCheckedChange={(on) => setDraft({ ...draft, [cat.key]: on })}
                className="mt-1 shrink-0"
              />
            ) : null}
          </li>
        ))}
      </ul>

      {managing ? (
        <Button type={type} className="w-full" aria-disabled={busy || undefined} onClick={() => choose(draft)}>
          {t("saveChoice")}
        </Button>
      ) : (
        <div className="grid gap-2">
          <Button type={type} aria-disabled={busy || undefined} onClick={() => choose({ analytics: true, marketing: true })}>
            {t("acceptAll")}
          </Button>
          <Button type={type} variant="secondary" className="border-border-strong" aria-disabled={busy || undefined} onClick={() => choose(NECESSARY_ONLY)}>
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

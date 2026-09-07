"use client";

import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Language switcher.
 *
 * Three things it now does that it did not:
 *
 * 1. Renders the native language name ("Français", "English", "Español")
 *    instead of a bare two-letter code. The keys already existed in
 *    common.json and were simply unused. "EN" means nothing to a Spanish
 *    speaker scanning for their language, and "FR" is a country code standing
 *    in for a language.
 * 2. Carries the query string across. usePathname() drops it, so switching
 *    language on /connexion?callbackUrl=… used to discard the callback and
 *    land the user somewhere other than where they were headed.
 * 3. Names the group for assistive tech. Without it a screen reader announced
 *    "FR link, middle dot, EN link" with nothing to say what the control is.
 */
export function LocaleSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    // useSearchParams opts the client tree up to the nearest Suspense boundary
    // out of prerendering. This switcher sits in the header of every marketing
    // page, so the boundary lives here: the header stays in the static HTML and
    // the query-preserving version takes over on hydration.
    <Suspense
      fallback={<Links className={className} search="" compact={compact} />}
    >
      <WithSearch className={className} compact={compact} />
    </Suspense>
  );
}

function WithSearch({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const search = useSearchParams().toString();
  return <Links className={className} search={search} compact={compact} />;
}

function Links({
  className,
  search,
  compact = false,
}: {
  className?: string;
  search: string;
  /**
   * Renders the locale CODE (FR · EN · ES) instead of the full language name.
   *
   * Not cosmetic: "Français · English · Español" is ~190px, and with five nav
   * items, the cross-portal link and the CTA the desktop header overflowed and
   * flex-wrap stacked it into two lines. The full name stays as the accessible
   * name, and the burger panel — which has the room — keeps showing it.
   */
  compact?: boolean;
}) {
  const active = useLocale();
  const pathname = usePathname();
  const t = useTranslations("common");

  const href = search
    ? { pathname, query: Object.fromEntries(new URLSearchParams(search)) }
    : pathname;

  return (
    <nav
      aria-label={t("locale.switch")}
      className={cn(
        "flex items-center gap-x-1 text-sm",
        !compact && "flex-wrap",
        className
      )}
    >
      {routing.locales.map((loc, i) => (
        <span key={loc} className="inline-flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden="true" className="text-fg-subtle">
              ·
            </span>
          )}
          <Link
            href={href}
            locale={loc}
            aria-current={loc === active ? "true" : undefined}
            // 20px was well under the 24px WCAG 2.5.8 AA floor, and this
            // control now ships in the burger panel and the app sidebar too.
            className={cn(
              "inline-flex min-h-11 items-center px-1 transition-colors",
              // px-2 in compact mode, measured rather than guessed: a two-letter
              // code at px-1 renders 23.92px wide, which is under the 24px WCAG
              // 2.5.8 floor that `bun run a11y:check` enforces. The full-name
              // variant is wide enough on its own.
              compact && "px-2 font-mono text-[12px] uppercase tracking-[0.08em]",
              loc === active
                ? "font-medium text-fg"
                : "text-fg-muted hover:text-fg"
            )}
            aria-label={compact ? t(`locale.${loc}`) : undefined}
          >
            {compact ? loc : t(`locale.${loc}`)}
          </Link>
        </span>
      ))}
    </nav>
  );
}

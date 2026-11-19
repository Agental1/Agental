"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Globe } from "lucide-react";
import { usePathname, Link } from "@/i18n/navigation";
import { routing, LANG_TAG, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Language switcher.
 *
 * - Every language is shown by its native name ("Français", "中文"), with a
 *   `lang` attribute so a screen reader pronounces each in its own voice.
 * - The query string is carried across: usePathname() drops it, so switching
 *   language on /connexion?callbackUrl=… used to discard the callback.
 * - `compact` (the pill header) collapses to a globe button that opens a
 *   small menu. Four inline names do not fit beside five nav links and the
 *   CTA, and two-letter codes ("ZH") mean nothing to a visitor scanning for
 *   their language.
 */
export function LocaleSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  // useSearchParams opts the client tree up to the nearest Suspense boundary
  // out of prerendering. The switcher sits in the header of every marketing
  // page, so the boundary lives here: the header stays in the static HTML and
  // the query-preserving version takes over on hydration.
  return (
    <Suspense fallback={<Switcher className={className} search="" compact={compact} />}>
      <WithSearch className={className} compact={compact} />
    </Suspense>
  );
}

function WithSearch({ className, compact }: { className?: string; compact?: boolean }) {
  const search = useSearchParams().toString();
  return <Switcher className={className} search={search} compact={compact} />;
}

function useHref(search: string) {
  const pathname = usePathname();
  return search
    ? { pathname, query: Object.fromEntries(new URLSearchParams(search)) }
    : pathname;
}

function Switcher({
  className,
  search,
  compact = false,
}: {
  className?: string;
  search: string;
  compact?: boolean;
}) {
  return compact ? (
    <Menu className={className} search={search} />
  ) : (
    <Inline className={className} search={search} />
  );
}

/** Full list of native names, for the burger panel, sidebar and auth screens. */
function Inline({ className, search }: { className?: string; search: string }) {
  const active = useLocale();
  const href = useHref(search);
  const t = useTranslations("common");
  return (
    <nav
      aria-label={t("locale.switch")}
      className={cn("flex flex-wrap items-center gap-1 text-[14px]", className)}
    >
      {routing.locales.map((loc) => (
        <Link
          key={loc}
          href={href}
          locale={loc}
          lang={LANG_TAG[loc]}
          hrefLang={LANG_TAG[loc]}
          aria-current={loc === active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-[var(--btn-radius)] px-3 transition-colors",
            loc === active
              ? "bg-surface-2 font-medium text-fg"
              : "text-fg-muted hover:text-fg"
          )}
        >
          {t(`locale.${loc}`)}
        </Link>
      ))}
    </nav>
  );
}

/** Globe button + menu, for the pill header. */
function Menu({ className, search }: { className?: string; search: string }) {
  const active = useLocale() as Locale;
  const href = useHref(search);
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t("locale.switch")}: ${t(`locale.${active}`)}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--btn-radius)] px-2.5 text-[13.5px] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Globe className="size-4" aria-hidden="true" />
        <span lang={LANG_TAG[active]}>{t(`locale.${active}`)}</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <nav
          id={menuId}
          aria-label={t("locale.switch")}
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-44 rounded-sedan-lg border border-border bg-surface p-1.5 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.45)]"
        >
          {routing.locales.map((loc) => (
            <Link
              key={loc}
              href={href}
              locale={loc}
              lang={LANG_TAG[loc]}
              hrefLang={LANG_TAG[loc]}
              aria-current={loc === active ? "true" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-10 items-center justify-between rounded-sedan px-3 text-[14px] transition-colors hover:bg-surface-2",
                loc === active ? "font-medium text-fg" : "text-fg-muted"
              )}
            >
              {t(`locale.${loc}`)}
              {loc === active && <Check className="size-4" aria-hidden="true" />}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

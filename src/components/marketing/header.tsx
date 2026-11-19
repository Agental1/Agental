"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";
import { cn } from "@/lib/utils";
import type { Portal } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Floating pill navigation: a rounded capsule over the page, with the
 * Talent | Casting switch, the section links, Sign in and the one call to
 * action. Primary navigation is set in bold; every item is a `.pressable`.
 */
export function MarketingHeader({
  portal,
  home,
  nav,
  cta,
  crossLink,
}: {
  portal?: Portal;
  home: string;
  nav: NavItem[];
  cta: { href: string; label: string };
  crossLink: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("common");
  const pathname = usePathname();
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        burgerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 px-[clamp(12px,2vw,24px)] pt-3">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-[var(--btn-radius)] focus:bg-cta focus:px-4 focus:py-2 focus:text-cta-fg"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="mx-auto flex h-14 max-w-[78rem] items-center justify-between gap-3 rounded-[var(--chrome-radius)] border border-border bg-surface/75 pl-5 pr-2 shadow-[0_1px_0_rgb(0_0_0/0.03),0_12px_32px_-18px_rgb(0_0_0/0.35)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={home} className="shrink-0" aria-label="Agental">
            <AgentalLogo mark={portal === "casting" ? "star" : "tape"} />
          </Link>
          {/* Talents | Casting: the two halves of Agental, one tap apart, at
              every width. It replaces a text link that only showed on screens
              1536px and wider, so most visitors never found the other side. */}
          <nav
            aria-label={t("nav.portalSwitch")}
            className="flex shrink-0 items-center rounded-[var(--btn-radius)] border border-border bg-surface-2/70 p-0.5"
          >
            {(["talents", "casting"] as const).map((side) => {
              const active = (portal ?? "talents") === side;
              return (
                <Link
                  key={side}
                  href={active ? home : crossLink.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "pressable inline-flex h-9 items-center rounded-[calc(var(--btn-radius)-2px)] px-3 text-[14px] font-bold",
                    active
                      ? "cta-fill"
                      : "text-fg-muted hover:text-fg"
                  )}
                >
                  {side === "talents" ? "Talents" : "Casting"}
                </Link>
              );
            })}
          </nav>
        </div>

        <nav className="hidden min-w-0 items-center gap-0.5 xl:flex">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable inline-flex h-9 items-center whitespace-nowrap rounded-[var(--btn-radius)] px-3 text-[14px] font-bold text-fg-muted hover:bg-surface-2 hover:text-fg",
                  active && "bg-accent-soft text-accent"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <LocaleSwitcher compact />
          <Link
            href="/connexion"
            className="pressable inline-flex h-9 items-center whitespace-nowrap rounded-[var(--btn-radius)] px-3 text-[14px] font-bold text-fg hover:bg-surface-2"
          >
            {t("nav.signIn")}
          </Link>
          <Button asChild size="sm" className="h-10 px-5">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>

        <button
          ref={burgerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="pressable inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--btn-radius)] text-fg hover:bg-surface-2 xl:hidden"
          aria-label={t(open ? "nav.closeMenu" : "nav.openMenu")}
          aria-controls="mobile-nav"
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="mx-auto mt-2 max-w-[78rem] rounded-sedan-xl border border-border bg-surface p-2 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.45)] xl:hidden"
        >
          <nav className="flex flex-col">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-sedan px-4 text-[17px] font-bold tracking-[-0.02em] text-fg hover:bg-surface-2"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={crossLink.href}
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center rounded-sedan px-4 text-[15px] text-fg-subtle hover:bg-surface-2"
            >
              {crossLink.label}
            </Link>
            <LocaleSwitcher className="mt-2 border-t border-border px-1 pt-3" />
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border p-2 pt-4 md:hidden">
              <Button asChild variant="secondary">
                <Link href="/connexion" onClick={() => setOpen(false)}>
                  {t("nav.signIn")}
                </Link>
              </Button>
              <Button asChild>
                <Link href={cta.href} onClick={() => setOpen(false)}>
                  {cta.label}
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

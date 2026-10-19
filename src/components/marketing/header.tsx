"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Portal } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

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
  const burgerRef = useRef<HTMLButtonElement>(null);

  // The panel had aria-expanded and nothing else: no Escape, no way back to the
  // trigger, and no link between the button and the panel it controls. Radix
  // Dialog would give all of this, but it would also change the visual
  // behaviour; this is the ten-minute version that fixes the semantics.
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
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      {/* Keyboard users otherwise tab through the logo, five nav links, the
          cross-link, three locale links and the CTA before reaching content —
          on every page. WCAG 2.4.1. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-sedan focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="mx-auto flex h-16 max-w-site items-center justify-between gap-4 px-[clamp(16px,4vw,40px)]">
        <Link href={home} className="shrink-0" aria-label="Agental">
          {/* `portal` was accepted and then ignored. The mockups put the portal
              name in the lockup, which is also the fastest way for a visitor to
              tell the two sides of the site apart. */}
          <AgentalLogo portal={portal === "casting" ? "Casting" : "Talents"} />
        </Link>

        <nav className="hidden items-center gap-5 md:flex lg:gap-6">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-6 items-center whitespace-nowrap text-[14.5px] text-fg-muted transition-colors hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-4 md:flex">
          {/* Hidden below lg: with five nav items, the locale switcher and the
              CTA, this is the first thing that has to give at 1024-1280. It
              stays reachable in the burger panel and in the footer. */}
          <Link
            href={crossLink.href}
            className="hidden min-h-6 items-center whitespace-nowrap text-sm text-fg-subtle transition-colors hover:text-fg lg:inline-flex"
          >
            {crossLink.label}
          </Link>
          <Button asChild size="sm">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>

        <button
          ref={burgerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          // 36x36 before. It clears the 24px AA floor, but it is the only way
          // into navigation on mobile and it was missed one-handed.
          className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center rounded-sedan p-2.5 text-fg hover:bg-surface-2"
          aria-label={t(open ? "nav.closeMenu" : "nav.openMenu")}
          aria-controls="mobile-nav"
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border bg-bg md:hidden">
          <nav className="mx-auto flex max-w-site flex-col gap-1 px-[clamp(16px,4vw,40px)] py-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-sedan px-3 py-2 text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={crossLink.href}
              onClick={() => setOpen(false)}
              className={cn(
                "mt-1 flex min-h-11 items-center gap-1 rounded-sedan px-3 py-2 text-sm text-fg-subtle hover:bg-surface-2"
              )}
            >
              {crossLink.label} <ArrowRight className="size-3.5" />
            </Link>
            <div className="flex items-center justify-between px-3 pt-3">
              <span />
              <Button asChild size="sm">
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

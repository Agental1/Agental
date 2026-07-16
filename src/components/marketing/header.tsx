"use client";

import { useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AgentalLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";
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
  portal: Portal;
  home: string;
  nav: NavItem[];
  cta: { href: string; label: string };
  crossLink: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={home} className="shrink-0" aria-label="Agental">
          <AgentalLogo />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-fg-muted transition-colors hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href={crossLink.href}
            className="text-sm text-fg-subtle transition-colors hover:text-fg"
          >
            {crossLink.label}
          </Link>
          <LocaleSwitcher />
          <Button asChild size="sm">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden rounded-sedan p-2 text-fg hover:bg-surface-2"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-bg md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-sedan px-3 py-2 text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={crossLink.href}
              onClick={() => setOpen(false)}
              className={cn(
                "mt-1 flex items-center gap-1 rounded-sedan px-3 py-2 text-sm text-fg-subtle hover:bg-surface-2"
              )}
            >
              {crossLink.label} <ArrowRight className="size-3.5" />
            </Link>
            <div className="flex items-center justify-between px-3 pt-3">
              <LocaleSwitcher />
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

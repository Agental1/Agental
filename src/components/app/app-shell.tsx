"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  User,
  Send,
  Video,
  TrendingUp,
  MessageSquare,
  Settings,
  LogOut,
  FolderKanban,
  Users,
  CreditCard,
  History,
  ShieldAlert,
  Gauge,
  Globe,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions/auth";
import { AgentalLogo, AgentalMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Portal } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  user: User,
  send: Send,
  video: Video,
  career: TrendingUp,
  messages: MessageSquare,
  settings: Settings,
  projects: FolderKanban,
  talents: Users,
  billing: CreditCard,
  audit: History,
  minors: ShieldAlert,
  console: Gauge,
  website: Globe,
};

export interface AppNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS | string;
}

/**
 * The signed-in shell, shared by the Talent app, the Casting app and admin.
 *
 * Layout is a two-column grid on the themed root, never a centered box:
 *   - from 768px up, a sidebar 15rem wide, sticky, full height, flush with the
 *     left edge of the window; the content column is fluid with a max width.
 *   - below 768px, the sidebar gives way to a sticky top bar with the monogram
 *     on the left and the menu button on the right; the menu opens a sheet
 *     with every destination.
 * Sizes are in rem and nothing is positioned against viewport pixels, so the
 * shell holds at any browser zoom: zooming in simply crosses into the phone
 * layout, zooming out leaves the sidebar where it is.
 *
 * `planSlot` sits at the top right on every size (the plan switcher).
 */
export function AppShell({
  portal,
  home,
  nav,
  userLabel,
  tag,
  planSlot,
  avatarSlot,
  children,
}: {
  portal: Portal;
  home: string;
  nav: AppNavItem[];
  userLabel: string;
  /** A small label after the logo, e.g. the admin console's name. */
  tag?: React.ReactNode;
  planSlot?: React.ReactNode;
  /** The person's picture (or initials), in the sidebar and the top bar. */
  avatarSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("app");
  const tc = useTranslations("common.app");
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function isActive(href: string) {
    if (href === home) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function items(onNavigate?: () => void) {
    return nav.map((item) => {
      const Icon = ICONS[item.icon] ?? LayoutDashboard;
      const active = isActive(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          data-nav={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "pressable flex min-h-11 items-center gap-3 rounded-sedan px-3 text-[15px] [--hover-scale:1.02] [--press-scale:1.04]",
            active
              ? "accent-wash border border-accent/40 bg-surface font-bold text-accent"
              : "border border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
          )}
        >
          <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
          {item.label}
        </Link>
      );
    });
  }

  const account = (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-2 px-3">
        {avatarSlot}
        <p className="min-w-0 truncate text-[13px] text-fg-subtle">{userLabel}</p>
      </div>
      <LocaleSwitcher className="mt-2 px-3" />
      <form action={logoutAction}>
        <button
          type="submit"
          className="pressable mt-1 flex min-h-11 w-full items-center gap-3 rounded-sedan px-3 text-[15px] text-fg-muted [--hover-scale:1.02] [--press-scale:1.04] hover:bg-surface-2 hover:text-fg"
        >
          <LogOut aria-hidden="true" className="size-[1.125rem]" />
          {t("actions.logout")}
        </button>
      </form>
    </div>
  );

  return (
    <div
      data-portal={portal}
      className="min-h-svh bg-bg text-fg md:grid md:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <aside className="sticky top-0 hidden h-svh flex-col overflow-y-auto border-r border-border bg-surface/60 p-4 md:flex">
        <Link href={home} aria-label="Agental" className="flex items-center gap-2 px-2 py-2">
          <AgentalLogo />
          {tag}
        </Link>
        <nav aria-label={tc("navLabel")} className="mt-4 flex flex-1 flex-col gap-1">
          {items()}
        </nav>
        {account}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:static md:h-16 md:justify-end md:border-0 md:bg-transparent md:px-8 md:backdrop-blur-none">
          <Link href={home} aria-label="Agental" className="flex items-center gap-2 md:hidden">
            <AgentalMark className="h-7 w-auto" />
            {tag}
          </Link>
          <div className="flex items-center gap-2">
            {planSlot}
            {avatarSlot && <span className="flex">{avatarSlot}</span>}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                aria-label={tc("menu")}
                className="pressable inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-fg md:hidden"
              >
                <Menu aria-hidden="true" className="size-5" />
              </SheetTrigger>
              <SheetContent
                side="right"
                showCloseButton={false}
                data-portal={portal}
                aria-describedby={undefined}
                className="w-[min(20rem,88vw)] overflow-y-auto bg-none p-3 md:hidden"
              >
                <div className="flex items-center justify-between pb-2 pl-2">
                  <SheetTitle asChild>
                    <span className="flex items-center gap-2">
                      <AgentalLogo />
                      <span className="sr-only">{tc("menu")}</span>
                    </span>
                  </SheetTitle>
                  <SheetClose
                    aria-label={tc("closeMenu")}
                    className="pressable inline-flex size-11 items-center justify-center rounded-full border border-border text-fg"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </SheetClose>
                </div>
                <nav aria-label={tc("navLabel")} className="flex flex-col gap-1 pb-3">
                  {items(() => setMenuOpen(false))}
                </nav>
                {account}
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="w-full max-w-[72rem] flex-1 px-4 pb-12 pt-6 sm:px-8 md:pt-2">
          {children}
        </main>
      </div>
      <Toaster position="bottom-center" />
    </div>
  );
}

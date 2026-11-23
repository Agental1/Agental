"use client";

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
  type LucideIcon,
} from "lucide-react";
import { UserMenu, type UserMenuProps } from "@/components/app/user-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions/auth";
import { AgentalLogo, AgentalMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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
 * The signed-in shell, shared by the Talent app, the Casting app and admin,
 * built on the shadcn sidebar (round 8) with `collapsible="icon"`:
 *   - from 768px up, the sidebar sits flush left. The toggle at the top left
 *     (or Cmd/Ctrl+B) folds it to icons with a tooltip each, and the page
 *     widens; the choice is kept in the `sidebar_state` cookie, read by the
 *     layouts on the server so the first paint is already right.
 *   - below 768px, the same menu button opens the sidebar as a sheet.
 *
 * The bottom left holds the account only (picture and email). Sign-out lives
 * in the avatar menu at the top right and the language in Settings; a shell
 * without an avatar menu (admin) keeps both at the bottom left.
 *
 * `planSlot` sits at the top right on every size (the plan switcher), next to
 * `headerSlot` (the notification bell).
 */
export function AppShell({
  portal,
  home,
  nav,
  userLabel,
  tag,
  planSlot,
  headerSlot,
  avatarSlot,
  userMenu,
  defaultOpen = true,
  languageInFooter,
  children,
}: {
  portal: Portal;
  home: string;
  nav: AppNavItem[];
  userLabel: string;
  /** A small label after the logo, e.g. the admin console's name. */
  tag?: React.ReactNode;
  planSlot?: React.ReactNode;
  /** Extra controls at the top right, before the plan (the notification bell). */
  headerSlot?: React.ReactNode;
  /** The person's picture (or initials), at the bottom left. */
  avatarSlot?: React.ReactNode;
  /**
   * The avatar menu (Profile, Settings, Sign out). When given, the avatar at
   * the top right opens it and sign-out leaves the sidebar.
   */
  userMenu?: Omit<UserMenuProps, "labels" | "email"> & { labels: Omit<UserMenuProps["labels"], "signOut"> };
  /** From the `sidebar_state` cookie: false starts folded to icons. */
  defaultOpen?: boolean;
  /** Keep the language switch at the bottom left (apps whose Settings has none). */
  languageInFooter?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("app");
  const tc = useTranslations("common.app");

  return (
    <SidebarProvider defaultOpen={defaultOpen} data-portal={portal} className="bg-bg text-fg">
      <Sidebar
        collapsible="icon"
        data-portal={portal}
        mobileTitle={tc("menu")}
        className="border-sidebar-border"
      >
        <SidebarHeader className="px-3 pt-4">
          {/* Desktop: the menu button sits in the sidebar, left of its edge, next to
              the logo; folded to icons it stays at the top of the icon column. */}
          <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-3">
            <Link
              href={home}
              aria-label="Agental"
              className="flex h-10 min-w-0 items-center gap-2 overflow-hidden px-1 group-data-[collapsible=icon]:order-2 group-data-[collapsible=icon]:px-0"
            >
              <AgentalLogo className="group-data-[collapsible=icon]:hidden" />
              <AgentalMark className="hidden h-7 w-auto shrink-0 group-data-[collapsible=icon]:block" />
              <span className="group-data-[collapsible=icon]:hidden">{tag}</span>
            </Link>
            <SidebarTrigger
              label={tc("toggleSidebar")}
              title={tc("toggleSidebar")}
              className="pressable hidden size-9 shrink-0 rounded-full text-fg-muted hover:text-fg md:inline-flex group-data-[collapsible=icon]:order-1"
            >
              <Menu aria-hidden="true" className="size-5" />
            </SidebarTrigger>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 pt-2">
          <nav aria-label={tc("navLabel")}>
            <NavItems nav={nav} home={home} />
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          {userMenu ? (
            // Round 10: the account at the bottom left opens the same menu as the
            // avatar at the top right; folded to icons, the avatar alone opens it.
            <UserMenu
              {...userMenu}
              email={userLabel}
              labels={{ ...userMenu.labels, signOut: t("actions.logout") }}
              side="top"
              align="start"
              triggerClassName="flex w-full min-w-0 items-center gap-2 rounded-sedan p-1 text-left hover:bg-surface-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-full"
              trigger={
                <>
                  <span className="flex shrink-0">{userMenu.avatar}</span>
                  <span className="min-w-0 truncate text-[13px] text-fg-subtle group-data-[collapsible=icon]:hidden">
                    {userLabel}
                  </span>
                </>
              }
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:justify-center">
              <span className="flex shrink-0">{avatarSlot}</span>
              <p className="min-w-0 truncate text-[13px] text-fg-subtle group-data-[collapsible=icon]:hidden">
                {userLabel}
              </p>
            </div>
          )}
          {languageInFooter && (
            <LocaleSwitcher className="mt-1 px-1 group-data-[collapsible=icon]:hidden" />
          )}
          {!userMenu && (
            <form action={logoutAction}>
              <SidebarMenuButton type="submit" tooltip={t("actions.logout")} className="text-fg-muted">
                <LogOut aria-hidden="true" />
                <span>{t("actions.logout")}</span>
              </SidebarMenuButton>
            </form>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-transparent">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:h-16 md:border-0 md:bg-transparent md:px-6 md:backdrop-blur-none">
          <div className="flex items-center gap-2">
            {/* Phone only: opens the sidebar as a sheet (desktop has it in the sidebar). */}
            <SidebarTrigger
              label={tc("toggleSidebar")}
              title={tc("toggleSidebar")}
              className="pressable size-11 rounded-full border border-border bg-surface text-fg md:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </SidebarTrigger>
            <Link href={home} aria-label="Agental" className="flex items-center gap-2 md:hidden">
              <AgentalMark className="h-7 w-auto" />
              {tag}
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {headerSlot}
            {planSlot}
            {userMenu ? (
              <UserMenu
                {...userMenu}
                email={userLabel}
                labels={{ ...userMenu.labels, signOut: t("actions.logout") }}
              />
            ) : null}
          </div>
        </header>

        <AppMain>{children}</AppMain>
      </SidebarInset>
      <Toaster position="bottom-center" />
    </SidebarProvider>
  );
}

/**
 * The page column (round 8b): about 12% wider than before (81rem instead of
 * 72rem) with the sidebar open, and wider again (90rem) when it is folded
 * to icons. Phones are unchanged.
 */
function AppMain({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  return (
    <main
      className={cn(
        "w-full flex-1 px-4 pb-12 pt-6 sm:px-8 md:pt-2 lg:px-10",
        state === "collapsed" ? "max-w-[90rem]" : "max-w-[81rem]"
      )}
    >
      {children}
    </main>
  );
}

function NavItems({ nav, home }: { nav: AppNavItem[]; home: string }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  function isActive(href: string) {
    if (href === home) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <SidebarMenu className="gap-1">
      {nav.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = isActive(item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.label}
              className={cn(
                "min-h-11 rounded-sedan px-3 text-[15px] transition-colors group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center [&>svg]:size-[1.125rem]",
                active
                  ? "border border-accent/40 bg-surface font-bold text-accent data-[active=true]:bg-surface data-[active=true]:text-accent"
                  : "border border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <Link
                href={item.href}
                data-nav={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => isMobile && setOpenMobile(false)}
              >
                <Icon aria-hidden="true" />
                <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

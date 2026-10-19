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
  type LucideIcon,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

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
};

export interface AppNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS | string;
}

export function AppSidebar({
  nav,
  header,
  userLabel,
}: {
  nav: AppNavItem[];
  header: React.ReactNode;
  userLabel: string;
}) {
  const t = useTranslations("app");
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface/40 p-4 md:flex">
      <div className="px-2 py-2">{header}</div>
      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active =
            pathname === item.href ||
            (item.href.endsWith("/app") && pathname === item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-sedan px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border pt-3">
        <p className="truncate px-3 text-xs text-fg-subtle">{userLabel}</p>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-sedan px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-4" />
            {t("actions.logout")}
          </button>
        </form>
      </div>
    </aside>
  );
}

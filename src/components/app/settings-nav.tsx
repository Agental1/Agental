"use client";

import { useEffect } from "react";
import { Bell, CreditCard, Globe, Lock, UserCog, type LucideIcon } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/domain/settings";


const ICONS: Record<SettingsSection, LucideIcon> = {
  account: UserCog,
  language: Globe,
  notifications: Bell,
  privacy: Lock,
  subscription: CreditCard,
};

/**
 * Settings menu (round 8b): a vertical list on the left from md up, a
 * dropdown at the top on a phone. Each section has its own address
 * (`?section=notifications`); an older `#notifications` link still lands on
 * the right section.
 */
export function SettingsNav({
  active,
  labels,
  label,
}: {
  active: SettingsSection;
  labels: Record<SettingsSection, string>;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const href = (s: SettingsSection) => `${pathname}?section=${s}`;

  // Links from before round 8b used #section: send them to their address.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if ((SETTINGS_SECTIONS as readonly string[]).includes(hash) && hash !== active) {
      router.replace(href(hash as SettingsSection));
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="md:hidden">
        <Select value={active} onValueChange={(v) => router.push(href(v as SettingsSection))}>
          <SelectTrigger className="w-full" aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-portal="talents">
            {SETTINGS_SECTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {labels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <nav aria-label={label} className="hidden md:block">
        <ul className="space-y-1">
          {SETTINGS_SECTIONS.map((s) => {
            const Icon = ICONS[s];
            const on = s === active;
            return (
              <li key={s}>
                <Link
                  href={href(s)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-sedan px-3 text-[15px] transition-colors",
                    on ? "bg-accent-soft font-bold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {labels[s]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

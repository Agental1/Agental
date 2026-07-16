"use client";

import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const pathname = usePathname();

  return (
    <div className={cn("inline-flex items-center gap-1 text-sm", className)}>
      {routing.locales.map((loc, i) => (
        <span key={loc} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-fg-subtle">·</span>}
          <Link
            href={pathname}
            locale={loc}
            aria-current={loc === active ? "true" : undefined}
            className={cn(
              "uppercase transition-colors",
              loc === active
                ? "text-fg font-medium"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {loc}
          </Link>
        </span>
      ))}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

/** The only pages that show the shortcut: Dashboard, Applications, Career. */
const SHOWN_ON = ["/talents/app", "/talents/app/candidatures", "/talents/app/carriere"];

/**
 * A small round button, bottom right, that opens Messages in one click.
 * Profile and Messages stay free of it, and so does every other page. It
 * sits above the phone's home indicator (safe-area inset) and grows slightly
 * under the pointer like every other clickable thing in the app.
 */
export function MessagesShortcut() {
  const t = useTranslations("common.app");
  const pathname = usePathname();
  if (!SHOWN_ON.includes(pathname)) return null;
  const label = t("openMessages");

  return (
    <Link
      href="/talents/app/messages"
      aria-label={label}
      title={label}
      className="cta-fill pressable group fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-40 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full px-4 shadow-[0_14px_30px_-12px_rgb(36_107_254/0.7)] [--hover-scale:1.06] [--press-scale:1.1]"
    >
      <MessageSquare aria-hidden="true" className="size-6 shrink-0" />
      <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-[14.5px] font-bold transition-[max-width] duration-200 ease-out group-hover:inline group-hover:max-w-40 group-focus-visible:inline group-focus-visible:max-w-40">
        {label}
      </span>
    </Link>
  );
}

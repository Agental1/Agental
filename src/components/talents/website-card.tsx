"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LIMELIGHT_DRAFT_KEY } from "@/data/limelight-templates";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function hasDraft() {
  try {
    return window.localStorage.getItem(LIMELIGHT_DRAFT_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * "Create your website" on the Talent dashboard. If the performer tried a
 * template before signing up, the draft is still on this device and the card
 * offers to continue it.
 *
 * TODO(backend): hide this card once the account has a site (`sites` table,
 * feat/round2-server); today every performer sees it.
 */
export function WebsiteCard({ href }: { href: string }) {
  const t = useTranslations("talents.limelight.card");
  const draft = useSyncExternalStore(subscribe, hasDraft, () => false);

  return (
    <Link
      href={draft ? `${href}#try` : href}
      className="pressable accent-wash flex flex-col gap-4 rounded-sedan-xl border border-accent/50 bg-surface p-5 [--hover-scale:1.01] [--press-scale:1.02] sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-3">
        <Globe aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
        <span className="block">
          <span className="block text-[1.125rem] font-bold leading-snug">{t("title")}</span>
          <span className="mt-0.5 block max-w-[60ch] text-[15px] text-fg-muted">{t("body")}</span>
        </span>
      </span>
      <span className="cta-fill inline-flex h-11 shrink-0 items-center self-start rounded-full px-5 text-[15px] font-bold sm:self-auto">
        {draft ? t("resume") : t("cta")}
      </span>
    </Link>
  );
}

"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Globe, X } from "lucide-react";
import { dismissWebsiteCard } from "@/app/actions/profile";
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
 * offers to continue it in the app, where it is saved to the account. The
 * dashboard hides the card once the account has a site.
 */
export function WebsiteCard({ href, appHref }: { href: string; appHref: string }) {
  const t = useTranslations("talents.limelight.card");
  const draft = useSyncExternalStore(subscribe, hasDraft, () => false);

  return (
    <Link
      href={draft ? appHref : href}
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

/**
 * Round 8: a performer whose profile already has a portfolio website sees a
 * slim line instead of the card: "Improve your website" opens the Limelight
 * form with "Redo my website" chosen. The close button hides it for good.
 */
export function ImproveWebsiteLine({ href }: { href: string }) {
  const t = useTranslations("talents.limelight.card");
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="flex items-center gap-3 rounded-sedan-lg border border-border bg-surface px-4 py-2.5">
      <Globe aria-hidden="true" className="size-4 shrink-0 text-accent" />
      <p className="min-w-0 flex-1 text-sm text-fg-muted">{t("improveBody")}</p>
      <Link href={href} className="cta-fill inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-bold">
        {t("improve")}
      </Link>
      <button
        type="button"
        aria-label={t("hide")}
        onClick={() => {
          setHidden(true);
          start(async () => {
            await dismissWebsiteCard();
          });
        }}
        className="rounded-full p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

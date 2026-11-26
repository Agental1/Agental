"use client";

import { createContext, useContext, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, Mail, TicketPercent } from "lucide-react";
import { PROMOTIONS } from "@/domain/pricing";
import { BetaPriceNote } from "@/components/ui/beta-price";
import { cn } from "@/lib/utils";

/**
 * Promotions on the plan cards (round 8), one shared component for the app's
 * Subscription page and the public pricing page. A small "Promotions" button
 * above the cards opens a panel with one checkbox per promotion (USC student
 * for now) and two email buttons. While a promotion is checked, every price
 * that has a promotional price shows the old price struck through, an arrow
 * and the new price.
 */

const PromotionsContext = createContext<{ active: string | null; setActive: (id: string | null) => void }>({
  active: null,
  setActive: () => undefined,
});

export function PromotionsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  return <PromotionsContext.Provider value={{ active, setActive }}>{children}</PromotionsContext.Provider>;
}

/** The promotion checked in the panel, if any (an id from PROMOTIONS). */
export function useActivePromotion(): string | null {
  return useContext(PromotionsContext).active;
}

/**
 * A price. `promos` maps a promotion id to its formatted promotional price;
 * when that promotion is checked, the base price is struck through.
 */
export function PromoPrice({
  base,
  promos,
  className,
}: {
  base: string;
  promos?: Record<string, string>;
  className?: string;
}) {
  const t = useTranslations("talents.promotions");
  const { active } = useContext(PromotionsContext);
  const promo = active ? promos?.[active] : undefined;
  if (!promo) return <span className={className}>{base}</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-1.5", className)}>
      <s className="text-[0.6em] font-normal text-fg-muted" aria-label={t("was", { price: base })}>
        {base}
      </s>
      <ArrowRight aria-hidden="true" className="size-[0.55em] self-center text-fg-muted" />
      <span className="text-accent">{promo}</span>
    </span>
  );
}

export function PromotionsButton({ accountEmail }: { accountEmail?: string | null }) {
  const t = useTranslations("talents.promotions");
  const { active, setActive } = useContext(PromotionsContext);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const mail = (subject: string) => {
    const body = accountEmail ? t("mailBody", { email: accountEmail }) : "";
    return `mailto:contact@agental.co?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
  };
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "rounded-sedan-lg border bg-surface transition-[box-shadow,border-color] duration-200",
          open ? "w-full max-w-sm border-accent/50 shadow-sm" : "border-border"
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-10 w-full items-center justify-between gap-2 px-3 text-sm font-bold"
        >
          <span className="flex items-center gap-2">
            <TicketPercent aria-hidden="true" className="size-4 text-accent" />
            {t("button")}
            {active && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-fg">1</span>}
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div id={panelId} className="enter space-y-3 border-t border-border px-3 pb-3 pt-3">
            {PROMOTIONS.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={active === p.id}
                  onChange={(e) => setActive(e.target.checked ? p.id : null)}
                />
                {p.label}
              </label>
            ))}
            <p className="text-xs text-fg-muted">{t("eligibility")}</p>
            <BetaPriceNote />
            <div className="grid gap-2">
              <a
                href={mail(t("subjectPlan"))}
                className="pressable inline-flex min-h-10 items-center gap-2 rounded-sedan border border-border px-3 text-sm font-bold text-accent hover:border-accent"
              >
                <Mail aria-hidden="true" className="size-4" /> {t("emailPlan")}
              </a>
              <a
                href={mail(t("subjectWebsite"))}
                className="pressable inline-flex min-h-10 items-center gap-2 rounded-sedan border border-border px-3 text-sm font-bold text-accent hover:border-accent"
              >
                <Mail aria-hidden="true" className="size-4" /> {t("emailWebsite")}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

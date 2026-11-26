import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Payments are not open during the beta (round 12). Every place that shows a
 * price wears a small "Beta" label next to the figure (`BetaBadge`) and, once
 * per price block, the line "Payments are not open yet." (`PaymentsNote`).
 * `BetaPriceNote` renders both on one row for blocks that have no room for two.
 * Works in server and client components.
 */
export function BetaBadge({ className }: { className?: string }) {
  const t = useTranslations("common.betaPrice");
  return (
    <span
      className={cn(
        "inline-flex items-center self-center rounded-full border border-border-strong px-2 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide text-fg-muted",
        className
      )}
    >
      {t("label")}
    </span>
  );
}

export function PaymentsNote({ className }: { className?: string }) {
  const t = useTranslations("common.betaPrice");
  return <p className={cn("text-[13px] text-fg-muted", className)}>{t("note")}</p>;
}

export function BetaPriceNote({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <BetaBadge />
      <PaymentsNote />
    </div>
  );
}
